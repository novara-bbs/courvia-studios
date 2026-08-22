/**
 * Los carritos caducados se borran.
 *
 * `carts.expiresAt` existía desde la Fase 4 y **nadie lo leía**: se escribía
 * en cada mutación, el campo prometía en su propia ayuda que «la barrida lo
 * borra», y `session-name.ts` justificaba los catorce días de cookie con esa
 * barrida. No había ninguna. La tabla crecía para siempre.
 *
 * Dos mitades, y las dos hacen falta:
 *
 *  1. Esta barrida BORRA la fila. Un carrito no es un documento con historia
 *     —no hay nada que auditar en una lista de la compra abandonada— así que
 *     no se archiva, se quita. Y borrar no libera stock, porque un carrito
 *     nunca reservó nada: el compromiso ocurre en `createCheckout`, no antes
 *     (§4 de CLAUDE.md). Caducar un carrito no toca el almacén.
 *  2. `NativeCommerceEngine.#findCart` filtra por fecha, así que un carrito
 *     pasado de plazo se comporta como inexistente desde el segundo en que
 *     caduca, sin esperar al siguiente tick. Sin eso, la caducidad sería una
 *     promesa que solo cumple el barrendero, y con cadencia diaria eso son
 *     hasta 24 h de diferencia entre lo que dice el campo y lo que hace el
 *     carrito.
 *
 * Sin transacción a propósito: es un `DELETE` por rango de fecha, no una
 * transición. Nada que serializar y nada que deshacer.
 */
import type { BasePayload, Where } from "payload";

export interface ExpiredCartsResult {
  /** Filas borradas en esta pasada. */
  deleted: number;
}

export interface ExpireCartsOptions {
  /** Reloj inyectable, para que un test no tenga que esperar catorce días. */
  now?: () => number;
  /** Tope por pasada: un tick tiene presupuesto, y mañana hay otro. */
  limit?: number;
}

export async function expireStaleCarts(
  payload: BasePayload,
  options: ExpireCartsOptions = {},
): Promise<ExpiredCartsResult> {
  const now = options.now?.() ?? Date.now();
  const cutoff = { expiresAt: { less_than: new Date(now).toISOString() } } as Where;

  // El borrado por `where` de Payload no acepta `limit`, así que el tope se
  // aplica eligiendo primero: una consulta acotada, y el borrado por los ids
  // que devuelva. Un tick tiene presupuesto y mañana hay otro.
  const doomed = await payload.find({
    collection: "carts",
    where: cutoff,
    limit: options.limit ?? 500,
    depth: 0,
    overrideAccess: true,
  });
  if (doomed.docs.length === 0) return { deleted: 0 };

  const result = await payload.delete({
    collection: "carts",
    where: { id: { in: doomed.docs.map((doc) => doc.id) } } as Where,
    overrideAccess: true,
  });
  return { deleted: result.docs.length };
}
