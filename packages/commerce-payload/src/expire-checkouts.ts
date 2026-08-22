/**
 * Sweeps abandoned checkouts: `pending_payment` orders older than the cutoff
 * move to `cancelled` through the SAME machinery as any payment event — pure
 * transition, row lock, transactional stock release — so the sweep can never
 * disagree with the webhook path. A checkout that pays DURING the sweep is
 * safe: the row lock serializes both writers and the loser re-reads a status
 * the trigger no longer applies to.
 */
import { transition } from "@courvia/commerce-domain";
import type { BasePayload, PayloadRequest, Where } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

import { lockOrderRow, moveStock } from "./tx-sql";

type Req = Partial<PayloadRequest>;
type TxArg = Parameters<typeof initTransaction>[0];

interface OrderLineRow {
  variant: number | { id: number };
  quantity: number;
}

function variantIdOf(line: OrderLineRow): number {
  return typeof line.variant === "object" ? line.variant.id : line.variant;
}

export interface ExpireResult {
  scanned: number;
  expired: number;
  skipped: number;
}

export async function expireStaleCheckouts(
  payload: BasePayload,
  options: { olderThanMinutes?: number; limit?: number; now?: () => number } = {},
): Promise<ExpireResult> {
  const olderThanMinutes = options.olderThanMinutes ?? 60;
  const limit = options.limit ?? 100;
  const now = options.now ?? Date.now;
  const cutoff = new Date(now() - olderThanMinutes * 60_000).toISOString();

  const stale = await payload.find({
    collection: "orders",
    where: {
      status: { equals: "pending_payment" },
      createdAt: { less_than: cutoff },
    } as Where,
    limit,
    depth: 0,
    overrideAccess: true,
    // Empty select = ids only (id is always included; naming it here trips
    // the generated OrdersSelect type).
    select: {},
  });

  let expired = 0;
  let skipped = 0;

  for (const doc of stale.docs) {
    const orderId = Number(doc.id);
    const req: Req = { payload };
    await initTransaction(req as TxArg);
    try {
      /*
       * Lock, y luego releer.
       *
       * Este barrido escanea fuera de transacción y decide dentro, así que
       * entre las dos cosas cabe un webhook que pague el pedido. Lo que hay
       * que ver es el estado que ese webhook confirmó.
       *
       * Hasta ahora el lock era `payload.update` con payload vacío, y con eso
       * el barrido REESCRIBÍA el estado viejo que había cargado antes del
       * lock: cancelaba un pedido pagado y le devolvía el stock al almacén.
       * El porqué está medido en `tx-sql.ts`; aquí solo se usa la versión
       * correcta, que es de lo que se trataba.
       *
       * Una fila que se evaporó entre el escaneo y ahora no es un error: se
       * cuenta como saltada, igual que una que ya no admite la transición.
       */
      if (!(await lockOrderRow(payload, req, orderId))) {
        await killTransaction(req as TxArg);
        skipped += 1;
        continue;
      }
      const order = (await payload.findByID({
        collection: "orders",
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })) as unknown as { status: string; lines: OrderLineRow[] };

      const result = transition(order.status as Parameters<typeof transition>[0], {
        type: "checkout.expired",
      });
      if (!result.ok) {
        await killTransaction(req as TxArg);
        skipped += 1;
        continue;
      }

      // release_reservation, en orden determinista (igual que el aplicador) y
      // con una sentencia por línea: sin lectura previa no hay actualización
      // que perder entre la lectura y la escritura.
      const sorted = [...order.lines].sort((a, b) => variantIdOf(a) - variantIdOf(b));
      for (const line of sorted) {
        await moveStock(payload, req, variantIdOf(line), line.quantity, "release");
      }

      await payload.update({
        collection: "orders",
        id: orderId,
        data: { status: result.next },
        overrideAccess: true,
        req,
      });
      await commitTransaction(req as TxArg);
      expired += 1;
    } catch (error) {
      await killTransaction(req as TxArg);
      throw error;
    }
  }

  return { scanned: stale.docs.length, expired, skipped };
}
