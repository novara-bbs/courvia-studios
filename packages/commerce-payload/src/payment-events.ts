/**
 * Applies a normalized PaymentEvent to persistence (§4 · payments.md):
 *
 *   1. INSERT the payments ledger row FIRST — (provider, providerEventId)
 *      UNIQUE is the idempotency: a replayed webhook blows up there, with
 *      zero side effects.
 *   2. LOCK the order row (an UPDATE inside the transaction takes a row
 *      lock), so concurrent events for the SAME order serialize and each
 *      one sees the status the previous one committed.
 *   3. Run the pure state machine on that fresh status.
 *   4. Apply transactional side effects (stock), update the order, and
 *      append outbox rows for external effects — all in ONE transaction.
 *
 * External effects (email, invoice, provider refund, physical restock) are
 * NEVER executed here: a rollback cannot unsend an email, and a gateway
 * call inside the transaction holds a row lock across a network
 * round-trip. They go to the outbox and are dispatched after commit.
 */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { MarketId } from "@courvia/platform";
import {
  SIDE_EFFECT_EXECUTION,
  paymentEventToTrigger,
  transition,
} from "@courvia/commerce-domain";
import type { PaymentEvent, SideEffect } from "@courvia/commerce-domain";
import type { BasePayload, PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

import { resolveRefundTotal } from "./refund-delta";

export type ApplyOutcome =
  /** Ledger row written and the order moved. */
  | { outcome: "applied"; orderId: string; status: string }
  /** Same (provider, eventId) seen before — expected replay, no effects. */
  | { outcome: "duplicate" }
  /** New event id but the order already passed this point (out-of-order
   *  delivery, or a zero-delta cumulative refund). Ledger row kept. */
  | { outcome: "already_applied" }
  /** Event carries no domain meaning from this status — nothing recorded,
   *  so a provider retry can succeed once the order catches up. */
  | { outcome: "invalid"; reason: string }
  /** Ledger row written; the event type moves nothing (e.g. authorized). */
  | { outcome: "recorded" }
  /** The signed event CONTRADICTS the order (paid-on-cancelled, amount or
   *  currency mismatch). Money may be captured: ledger row + alert outbox
   *  row are kept, the order does NOT move, a human must look. */
  | { outcome: "conflict"; reason: string }
  | { outcome: "order_not_found" };

interface OrderLineRow {
  variant: number | { id: number };
  quantity: number;
}

interface OrderRow {
  id: number;
  status: string;
  market: MarketId;
  totalAmount: number;
  refundedAmount: number;
  lines: OrderLineRow[];
}

type Req = Partial<PayloadRequest>;
type TxArg = Parameters<typeof initTransaction>[0];

/** Serializes concurrent appliers for one order: an UPDATE takes a row
 *  lock, and a later SELECT in this transaction sees whatever the previous
 *  holder committed. Local-API-portable — no raw SQL, no dialect coupling. */
async function lockOrderRow(payload: BasePayload, req: Req, orderId: number): Promise<void> {
  await payload.update({
    collection: "orders",
    id: orderId,
    data: {},
    overrideAccess: true,
    req,
  });
}

function variantIdOf(line: OrderLineRow): number {
  return typeof line.variant === "object" ? line.variant.id : line.variant;
}

async function adjustStock(
  payload: BasePayload,
  req: Req,
  lines: OrderLineRow[],
  effect: "commit_stock" | "release_reservation",
): Promise<void> {
  // Deterministic order avoids deadlocks between concurrent transactions.
  const sorted = [...lines].sort((a, b) => variantIdOf(a) - variantIdOf(b));
  for (const line of sorted) {
    const variantId = variantIdOf(line);
    const found = await payload.find({
      collection: "inventory",
      where: { variant: { equals: variantId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const row = found.docs[0] as { id: number } | undefined;
    if (row === undefined) continue; // no inventory row = untracked stock
    // Lock the inventory row, THEN read the value this transaction builds
    // on — a read before the lock is a lost update waiting to happen.
    await payload.update({ collection: "inventory", id: row.id, data: {}, overrideAccess: true, req });
    const fresh = (await payload.findByID({
      collection: "inventory",
      id: row.id,
      depth: 0,
      overrideAccess: true,
      req,
    })) as unknown as { qtyOnHand: number; qtyCommitted: number };
    const delta =
      effect === "release_reservation"
        ? { qtyCommitted: Math.max(0, fresh.qtyCommitted - line.quantity) }
        : {
            qtyOnHand: Math.max(0, fresh.qtyOnHand - line.quantity),
            qtyCommitted: Math.max(0, fresh.qtyCommitted - line.quantity),
          };
    await payload.update({ collection: "inventory", id: row.id, data: delta, overrideAccess: true, req });
  }
}

const STOCK_EFFECTS = new Set<SideEffect>(["commit_stock", "release_reservation"]);

async function writeOutboxRow(
  payload: BasePayload,
  req: Req,
  orderId: number,
  effect: SideEffect,
  data: Record<string, unknown>,
): Promise<void> {
  await payload.create({
    collection: "outbox",
    overrideAccess: true,
    req,
    data: {
      // Callers only pass effects whose execution is "outbox" — exactly the
      // subset the collection's select accepts.
      effect: effect as never,
      order: orderId,
      status: "pending",
      attempts: 0,
      payload: data,
    },
  });
}

/** Ledger row + alert + commit: the event is kept as evidence, the order
 *  does not move, and a pending outbox task makes the conflict impossible
 *  to miss in the admin. */
async function commitConflict(
  payload: BasePayload,
  req: Req,
  orderId: number,
  reason: string,
  event: PaymentEvent,
): Promise<ApplyOutcome> {
  await writeOutboxRow(payload, req, orderId, "alert_payment_conflict", {
    reason,
    eventType: event.type,
    providerEventId: event.providerEventId,
    amountMinor: event.amount.amount,
    currency: event.amount.currency,
  });
  await commitTransaction(req as TxArg);
  return { outcome: "conflict", reason };
}

export async function applyPaymentEvent(
  payload: BasePayload,
  event: PaymentEvent,
): Promise<ApplyOutcome> {
  const orderId = Number(event.orderId);
  if (!Number.isInteger(orderId)) return { outcome: "order_not_found" };

  const req: Req = { payload };
  await initTransaction(req as TxArg);

  try {
    // 1. Ledger row FIRST: the unique index is the idempotency barrier.
    // Whether a failure here WAS the barrier is decided afterwards by
    // re-reading — never by matching error prose, which is minified,
    // localized and version-dependent.
    try {
      await payload.create({
        collection: "payments",
        overrideAccess: true,
        req,
        data: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
          order: orderId,
          providerPaymentId: event.providerPaymentId,
          amount: event.amount.amount,
          partial: event.partial === true,
          occurredAt: event.occurredAt,
        },
      });
    } catch (error) {
      await killTransaction(req as TxArg);
      const existing = await payload.find({
        collection: "payments",
        where: {
          and: [
            { provider: { equals: event.provider } },
            { providerEventId: { equals: event.providerEventId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (existing.totalDocs > 0) return { outcome: "duplicate" };
      throw error;
    }

    // 2. Serialize per order: lock, then read the status the lock revealed.
    await lockOrderRow(payload, req, orderId).catch(() => null);
    const order = (await payload
      .findByID({ collection: "orders", id: orderId, depth: 0, overrideAccess: true, req })
      .catch(() => null)) as OrderRow | null;
    if (order === null) {
      await killTransaction(req as TxArg);
      return { outcome: "order_not_found" };
    }
    const currency = MARKET_DEFINITIONS[order.market].currency;

    const trigger = paymentEventToTrigger(event);
    if (trigger === null) {
      // e.g. `authorized`: worth keeping in the ledger, moves nothing.
      await commitTransaction(req as TxArg);
      return { outcome: "recorded" };
    }

    // 3. A signed event that CONTRADICTS the order is a conflict, not a
    // replay: money may be captured while the order says otherwise. This is
    // the server-side half of §4's "amounts validated on the server".
    if (event.type === "paid") {
      if (order.status === "cancelled") {
        return await commitConflict(payload, req, orderId, "paid_on_cancelled_order", event);
      }
      if (
        order.status === "pending_payment" &&
        (event.amount.currency !== currency || event.amount.amount !== order.totalAmount)
      ) {
        return await commitConflict(
          payload,
          req,
          orderId,
          `amount_mismatch: expected ${order.totalAmount} ${currency}, got ${event.amount.amount} ${event.amount.currency}`,
          event,
        );
      }
    }

    // 4. Refund amounts: compute the DELTA — providers like Stripe report a
    // running total (event.cumulative) — so replays absorb to zero and the
    // remainder of a partial refund still lands.
    let refundedAfter = order.refundedAmount;
    if (event.type === "refunded") {
      if (event.amount.currency !== currency) {
        return await commitConflict(payload, req, orderId, "refund_currency_mismatch", event);
      }
      const resolved = resolveRefundTotal(order, {
        amountMinor: event.amount.amount,
        cumulative: event.cumulative === true,
      });
      refundedAfter = resolved.refundedAfter;
      if (resolved.delta <= 0) {
        // Zero-delta cumulative replay: ledger kept, nothing moves.
        await commitTransaction(req as TxArg);
        return { outcome: "already_applied" };
      }
      // The partial flag derives from the running total vs the order total,
      // never from the event alone.
      if (trigger.type === "payment.refunded") {
        trigger.partial = resolved.partial;
      }
    }

    const result = transition(order.status as Parameters<typeof transition>[0], trigger);
    if (!result.ok) {
      if (result.rejection === "already_applied" || result.rejection === "terminal_status") {
        // Expected replay: keep the ledger row for audit, change nothing.
        await commitTransaction(req as TxArg);
        return { outcome: "already_applied" };
      }
      // Genuinely invalid from this status: roll EVERYTHING back (ledger row
      // included) so a provider retry can apply cleanly later.
      await killTransaction(req as TxArg);
      return { outcome: "invalid", reason: result.reason };
    }

    // 5. Transactional side effects (stock), serialized by the order lock.
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] === "transactional" && STOCK_EFFECTS.has(effect)) {
        await adjustStock(payload, req, order.lines, effect as "commit_stock");
      }
    }

    // 6. The order itself.
    await payload.update({
      collection: "orders",
      id: orderId,
      overrideAccess: true,
      req,
      data: {
        status: result.next,
        ...(event.type === "refunded" ? { refundedAmount: refundedAfter } : {}),
      },
    });

    // 7. Outbox rows, same transaction.
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] !== "outbox") continue;
      await writeOutboxRow(
        payload,
        req,
        orderId,
        effect,
        effect === "execute_provider_refund" || effect === "restock_if_applicable"
          ? { amountMinor: event.amount.amount, cumulative: event.cumulative === true }
          : {},
      );
    }

    await commitTransaction(req as TxArg);
    return { outcome: "applied", orderId: String(orderId), status: result.next };
  } catch (error) {
    await killTransaction(req as TxArg);
    throw error;
  }
}
