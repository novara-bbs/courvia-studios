/**
 * Applies a normalized PaymentEvent to persistence (§4 · payments.md):
 *
 *   1. INSERT the payments ledger row FIRST — (provider, providerEventId)
 *      UNIQUE is the idempotency: a replayed webhook blows up here, with
 *      zero side effects.
 *   2. Run the pure state machine on the CURRENT order status.
 *   3. Apply transactional side effects (stock), update the order, and
 *      append outbox rows for external effects — all in ONE transaction.
 *
 * External effects (email, invoice, provider refund) are NEVER executed
 * here: a rollback cannot unsend an email, and a gateway call inside the
 * transaction holds a row lock across a network round-trip. They go to the
 * outbox and are dispatched after commit.
 */
import {
  SIDE_EFFECT_EXECUTION,
  paymentEventToTrigger,
  transition,
} from "@courvia/commerce-domain";
import type { PaymentEvent, SideEffect } from "@courvia/commerce-domain";
import type { BasePayload, PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

export type ApplyOutcome =
  /** Ledger row written and the order moved. */
  | { outcome: "applied"; orderId: string; status: string }
  /** Same (provider, eventId) seen before — expected replay, no effects. */
  | { outcome: "duplicate" }
  /** New event id but the order already passed this point (out-of-order
   *  delivery). Ledger row kept for audit; no transition. */
  | { outcome: "already_applied" }
  /** Event carries no domain meaning from this status — nothing recorded,
   *  so a provider retry can succeed once the order catches up. */
  | { outcome: "invalid"; reason: string }
  /** Ledger row written; the event type moves nothing (e.g. authorized). */
  | { outcome: "recorded" }
  | { outcome: "order_not_found" };

interface OrderLineRow {
  variant: number | { id: number };
  quantity: number;
}

function isUniqueViolation(error: unknown): boolean {
  const inspect = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown };
    if (record.code === "23505") return true;
    if (typeof record.message === "string" && record.message.includes("duplicate key")) return true;
    // @payloadcms/drizzle catches Postgres 23505 and re-throws a
    // ValidationError whose MESSAGE names the unique index's columns — for
    // the payments ledger that is exactly (provider, provider_event_id).
    // Match on the message, never on error.name: class names are minified
    // in production builds.
    if (
      typeof record.message === "string" &&
      record.message.includes("provider, provider_event_id")
    ) {
      return true;
    }
    return inspect(record.cause);
  };
  return inspect(error);
}

async function adjustStock(
  payload: BasePayload,
  req: Partial<PayloadRequest>,
  lines: OrderLineRow[],
  effect: "commit_stock" | "release_reservation" | "reserve_stock_temporarily",
): Promise<void> {
  for (const line of lines) {
    const variantId = typeof line.variant === "object" ? line.variant.id : line.variant;
    const existing = await payload.find({
      collection: "inventory",
      where: { variant: { equals: variantId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const row = existing.docs[0] as { id: number; qtyOnHand: number; qtyCommitted: number } | undefined;
    if (row === undefined) continue; // no inventory row = untracked stock
    const delta =
      effect === "reserve_stock_temporarily"
        ? { qtyCommitted: row.qtyCommitted + line.quantity }
        : effect === "release_reservation"
          ? { qtyCommitted: Math.max(0, row.qtyCommitted - line.quantity) }
          : {
              qtyOnHand: Math.max(0, row.qtyOnHand - line.quantity),
              qtyCommitted: Math.max(0, row.qtyCommitted - line.quantity),
            };
    await payload.update({
      collection: "inventory",
      id: row.id,
      data: delta,
      overrideAccess: true,
      req,
    });
  }
}

/** Transactional effects the payment path knows how to run. Anything else
 *  transactional (picking, RMA rows) belongs to non-payment triggers. */
const STOCK_EFFECTS = new Set<SideEffect>([
  "commit_stock",
  "release_reservation",
  "reserve_stock_temporarily",
]);

export async function applyPaymentEvent(
  payload: BasePayload,
  event: PaymentEvent,
): Promise<ApplyOutcome> {
  const orderId = Number(event.orderId);
  if (!Number.isInteger(orderId)) return { outcome: "order_not_found" };

  const req: Partial<PayloadRequest> = { payload };
  await initTransaction(req as Parameters<typeof initTransaction>[0]);

  try {
    // 1. Ledger row FIRST: the unique index is the idempotency barrier.
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
      if (isUniqueViolation(error)) {
        await killTransaction(req as Parameters<typeof killTransaction>[0]);
        return { outcome: "duplicate" };
      }
      throw error;
    }

    // 2. Current order state, read inside the transaction.
    const order = (await payload
      .findByID({ collection: "orders", id: orderId, depth: 0, overrideAccess: true, req })
      .catch(() => null)) as
      | { id: number; status: string; refundedAmount: number; lines: OrderLineRow[] }
      | null;
    if (order === null) {
      await killTransaction(req as Parameters<typeof killTransaction>[0]);
      return { outcome: "order_not_found" };
    }

    const trigger = paymentEventToTrigger(event);
    if (trigger === null) {
      // e.g. `authorized`: worth keeping in the ledger, moves nothing.
      await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
      return { outcome: "recorded" };
    }

    const result = transition(order.status as Parameters<typeof transition>[0], trigger);
    if (!result.ok) {
      if (result.rejection === "already_applied" || result.rejection === "terminal_status") {
        // Expected replay: keep the ledger row for audit, change nothing.
        await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
        return { outcome: "already_applied" };
      }
      // Genuinely invalid from this status: roll EVERYTHING back (ledger row
      // included) so a provider retry can apply cleanly later.
      await killTransaction(req as Parameters<typeof killTransaction>[0]);
      return { outcome: "invalid", reason: result.reason };
    }

    // 3. Transactional side effects.
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] === "transactional" && STOCK_EFFECTS.has(effect)) {
        await adjustStock(payload, req, order.lines, effect as "commit_stock");
      }
    }

    // 4. The order itself.
    const isRefund = event.type === "refunded";
    await payload.update({
      collection: "orders",
      id: orderId,
      overrideAccess: true,
      req,
      data: {
        status: result.next,
        ...(isRefund ? { refundedAmount: order.refundedAmount + event.amount.amount } : {}),
      },
    });

    // 5. Outbox rows, same transaction.
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] !== "outbox") continue;
      await payload.create({
        collection: "outbox",
        overrideAccess: true,
        req,
        data: {
          // The loop filters on SIDE_EFFECT_EXECUTION === "outbox", which is
          // exactly the subset the collection's select accepts.
          effect: effect as never,
          order: orderId,
          status: "pending",
          attempts: 0,
          payload:
            effect === "execute_provider_refund"
              ? { amountMinor: event.amount.amount, partial: event.partial === true }
              : {},
        },
      });
    }

    await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
    return { outcome: "applied", orderId: String(orderId), status: result.next };
  } catch (error) {
    await killTransaction(req as Parameters<typeof killTransaction>[0]);
    throw error;
  }
}
