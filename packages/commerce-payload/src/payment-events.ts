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

import { int, qualified, transactionSql } from "./tx-sql";
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

/* ==========================================================================
 * Bloqueo y stock: SQL crudo dentro de la transacción, y por qué no hay
 * alternativa con la Local API
 * ==========================================================================
 *
 * Hasta ahora las dos cosas se hacían con el mismo idioma: `payload.update`
 * con un payload vacío «para tomar el lock», y después releer. **Toma el
 * lock** —un segundo escritor se bloquea de verdad— pero no sirve, y no es
 * una sospecha: `apps/web/src/server/outbox.ts` lo documenta medido. El
 * `update` por id de Payload es un read-modify-write que CARGA el documento
 * ANTES del lock y escribe la fila entera al soltarlo, así que el escritor
 * que estaba bloqueado se despierta y reescribe las columnas que el ganador
 * acaba de confirmar. Ese fichero probó este mismo idioma primero, falló su
 * test de concurrencia, y por eso acabó en SQL.
 *
 * Aquí el precio de equivocarse es mayor que allí:
 *
 *  - En `lockOrderRow`, el perdedor reescribía el `status` que había leído
 *    antes del lock. Dos webhooks concurrentes sobre el mismo pedido —un
 *    `paid` y un `refunded`, que llegan por rutas distintas— y el `paid`
 *    queda deshecho.
 *  - En `adjustStock`, el `update` vacío escribía las cantidades viejas, la
 *    relectura veía su propia escritura vieja, y el delta salía de ahí:
 *    actualización perdida de libro. Dos pedidos pagados a la vez descontaban
 *    una unidad en vez de dos.
 *
 * Las dos se arreglan con Postgres y ninguna se puede arreglar sin él: no hay
 * incremento atómico en la Local API, ni forma de pedir `FOR UPDATE`. Así que
 * este bloque habla SQL, con la misma disciplina que `outbox.ts`: los
 * identificadores salen del adaptador y se validan antes de interpolarse, los
 * valores son enteros comprobados, y si el adaptador no es Postgres o no hay
 * transacción, esto **lanza** en vez de degradar en silencio a lo que estaba
 * roto.
 */

/**
 * Serializa a los que apliquen eventos sobre el mismo pedido.
 *
 * `SELECT … FOR UPDATE` y no un `UPDATE`: lo que hace falta es el lock, no
 * escribir. Escribir es justo lo que rompía esto (ver `tx-sql.ts`).
 *
 * Devuelve `false` si no hay tal pedido, que es la forma barata de contestar
 * `order_not_found` antes de tocar el libro mayor.
 */
async function lockOrderRow(payload: BasePayload, req: Req, orderId: number): Promise<boolean> {
  const run = transactionSql(payload, req);
  const result = await run(
    `select id from ${qualified(payload, "orders")} where id = ${int(orderId, "orderId")} for update`,
  );
  return (result.rowCount ?? result.rows.length) > 0;
}

function variantIdOf(line: OrderLineRow): number {
  return typeof line.variant === "object" ? line.variant.id : line.variant;
}

/**
 * Descuenta stock con una sola sentencia por línea.
 *
 * No hay lectura, así que no hay nada que perder entre la lectura y la
 * escritura: `qty_committed = greatest(0, qty_committed - N)` lo calcula
 * Postgres sobre la fila que él mismo bloquea al escribirla. Dos
 * transacciones concurrentes se serializan solas y las dos restan.
 *
 * `greatest(0, …)` conserva el comportamiento anterior —el stock nunca baja
 * de cero— y con él su límite: si dos pedidos descuentan más de lo que hay,
 * el segundo se queda en cero en vez de fallar. Reservar de verdad es trabajo
 * del checkout, que compromete stock ANTES de cobrar; esto solo consuma lo
 * que aquel apartó.
 *
 * Una variante sin fila de inventario no se toca: `where` no encuentra nada y
 * la sentencia afecta a cero filas, que es lo mismo que decía el `continue`
 * de antes — stock no controlado.
 */
async function adjustStock(
  payload: BasePayload,
  req: Req,
  lines: OrderLineRow[],
  effect: "commit_stock" | "release_reservation",
): Promise<void> {
  if (lines.length === 0) return;
  const run = transactionSql(payload, req);
  const table = qualified(payload, "inventory");
  // Orden determinista: dos transacciones que tocan las mismas variantes en
  // el mismo orden no se abrazan.
  const sorted = [...lines].sort((a, b) => variantIdOf(a) - variantIdOf(b));
  for (const line of sorted) {
    const variantId = int(variantIdOf(line), "variantId");
    const quantity = int(line.quantity, "quantity");
    const columns =
      effect === "release_reservation"
        ? `qty_committed = greatest(0, qty_committed - ${quantity})`
        : `qty_on_hand = greatest(0, qty_on_hand - ${quantity}), ` +
          `qty_committed = greatest(0, qty_committed - ${quantity})`;
    await run(
      `update ${table} set ${columns}, updated_at = now() where variant_id = ${variantId}`,
    );
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
    // 1. EL LOCK VA PRIMERO, y este orden es obligatorio, no una preferencia.
    //
    // Insertar la fila del libro mayor toma un `FOR KEY SHARE` sobre el
    // pedido, porque `payments.order` es una clave ajena. Si después se
    // pidiera `FOR UPDATE`, dos transacciones concurrentes sobre el mismo
    // pedido se abrazarían: cada una tiene el KEY SHARE que la otra necesita
    // convertir en UPDATE. Medido: `deadlock detected (40P01)` en
    // `commerce-adapter.test.ts` la primera vez que se escribió el lock de
    // verdad. Tomando el lock antes, la segunda espera en la puerta y no hay
    // ciclo.
    //
    // Esto NO afloja la regla de `.claude/rules/payments.md`: la fila del
    // libro mayor sigue insertándose ANTES de aplicar la transición, que es
    // lo que dice la regla y lo que hace que un duplicado reviente sin
    // efectos.
    const locked = await lockOrderRow(payload, req, orderId);
    if (!locked) {
      await killTransaction(req as TxArg);
      return { outcome: "order_not_found" };
    }

    // 2. Ledger row: the unique index is the idempotency barrier.
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

    // 3. El estado que el lock reveló.
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

    // 4. A signed event that CONTRADICTS the order is a conflict, not a
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

    // 5. Refund amounts: compute the DELTA — providers like Stripe report a
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

    // 6. Transactional side effects (stock), serialized by the order lock.
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] === "transactional" && STOCK_EFFECTS.has(effect)) {
        await adjustStock(payload, req, order.lines, effect as "commit_stock");
      }
    }

    // 7. The order itself.
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

    // 8. Outbox rows, same transaction.
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
