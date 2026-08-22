/**
 * La barrida de carritos caducados, con su tope y su porqué en un solo sitio.
 *
 * Gemelo de `sweep-checkouts.ts`, y por la misma razón de frontera: la regla
 * `adapters-are-not-imported-by-routes` (.dependency-cruiser.cjs) permite
 * nombrar un adaptador concreto en tres sitios —la raíz de composición, un
 * test y un script de mantenimiento—, y `expireStaleCarts` es una función de
 * adaptador, no un método del puerto. Un `CommerceService.expireCarts()` que
 * solo llamaría un cron es justo el ensanchamiento que esa regla rechaza.
 *
 * Aquí viven además las dos cifras que el motor no debe conocer: cuántos
 * carritos caben en un tick.
 */
import { expireStaleCarts } from "@courvia/commerce-payload";
import type { ExpiredCartsResult } from "@courvia/commerce-payload";
import type { BasePayload } from "payload";

export type { ExpiredCartsResult };

/**
 * Tope por pasada.
 *
 * Más alto que el de los checkouts (50) porque borrar un carrito es un
 * `DELETE` por id sin transición, sin outbox y sin tocar el almacén, y
 * porque los carritos abandonados llegan en volumen muy distinto al de los
 * pagos a medias. Y acotado igualmente: este tick lo comparte con el
 * despachador del outbox y con la barrida de checkouts.
 */
export const CART_SWEEP_LIMIT = 500;

export async function sweepStaleCarts(payload: BasePayload): Promise<ExpiredCartsResult> {
  return expireStaleCarts(payload, { limit: CART_SWEEP_LIMIT });
}
