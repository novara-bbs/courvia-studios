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
  /** Órdenes cuya liberación LANZÓ — cada una está nombrada en el log. */
  failed: number;
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
  let failed = 0;

  for (const doc of stale.docs) {
    // Una orden envenenada no secuestra el barrido: `releaseCheckout` ya
    // trata los no-errores (fila evaporada, transición inaplicable) como
    // `false`, así que lo que LANZA es una avería de esa orden — se cuenta,
    // se nombra, y las reservas de las demás se liberan igual. Con cadencia
    // diaria, abortar aquí retenía el stock de todas las siguientes 24 h más.
    try {
      if (await releaseCheckout(payload, Number(doc.id))) expired += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error(`[expire-checkouts] orden ${String(doc.id)} falló: ${String(error)}`);
    }
  }

  return { scanned: stale.docs.length, expired, skipped, failed };
}

/**
 * Cancela UN checkout a medias y devuelve su reserva al almacén.
 *
 * Devuelve `true` si lo hizo, `false` si no había nada que hacer: la fila se
 * evaporó, o el pedido ya no admite `checkout.expired` porque un webhook lo
 * pagó mientras tanto. Ninguno de los dos es un error.
 *
 * ESTÁ EXPORTADA A PROPÓSITO, y el porqué es el mismo de `tx-sql.ts`: el
 * barrido no es el único que necesita deshacer un checkout. `createCheckout`
 * reserva stock y DESPUÉS pide sesión a la pasarela; cuando la pasarela dice
 * que no sabe cobrar —`NotImplementedError`, que es lo que hoy contestan los
 * cuatro adaptadores— esperar al siguiente tick para soltar esa reserva
 * significa, con cadencia diaria, hasta 24 h de stock retenido por un pago
 * que nadie intentó. Una función que solo el barrido puede llamar es una
 * función que el otro llamante reimplementa mal.
 */
export async function releaseCheckout(payload: BasePayload, orderId: number): Promise<boolean> {
  {
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
        return false;
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
        return false;
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
      return true;
    } catch (error) {
      await killTransaction(req as TxArg);
      throw error;
    }
  }
}
