/**
 * Carrito atado a una conexión (ADR-029, invariantes 1-6 del plan).
 *
 * El carrito es donde se fija el owner y donde se pierde el control si no se
 * fija: un carrito que empieza en un motor y termina en otro es dinero
 * contado dos veces o ninguna. Por eso `Cart` es genérico en el motor y sus
 * líneas también: meter una variante Shopify en un carrito nativo no es algo
 * que se compruebe en runtime y se registre en un log, es algo que no
 * compila.
 */
import type { Currency, MarketId } from "@courvia/platform";

import type { CartRef, CommerceOwner, EngineKind, VariantRef } from "./engine";
import type { Money } from "./money";

export interface CartLine<E extends EngineKind = EngineKind> {
  readonly variant: VariantRef<E>;
  /** SKU tal y como lo conoce el motor propietario; para mostrar y conciliar. */
  readonly sku: string;
  readonly quantity: number;
  /**
   * Lo que el motor propietario dice que vale la unidad. **Nunca es
   * autoritativo para cobrar**: el importe del pedido se calcula y se valida
   * en servidor (§4 de CLAUDE.md). Es `null` cuando el motor no lo expone en
   * el carrito.
   */
  readonly unitAmount: Money | null;
}

export interface Cart<E extends EngineKind = EngineKind> {
  readonly ref: CartRef<E>;
  /** Fijado al crear el carrito. No se reasigna en toda su vida. */
  readonly owner: CommerceOwner<E>;
  readonly market: MarketId;
  readonly currency: Currency;
  readonly lines: readonly CartLine<E>[];
  /**
   * Subtotal informativo del motor. `null` cuando no lo publica. Lo mismo que
   * `CartLine.unitAmount`: sirve para enseñar, no para cobrar.
   */
  readonly subtotal: Money | null;
}

export interface CartLineInput<E extends EngineKind = EngineKind> {
  readonly variant: VariantRef<E>;
  readonly quantity: number;
}

export interface CreateCartInput<E extends EngineKind = EngineKind> {
  readonly market: MarketId;
  readonly lines?: readonly CartLineInput<E>[];
}

/**
 * El máximo de unidades por línea, y por qué vive en el dominio.
 *
 * Lo validaba el zod de la acción de servidor, pero por PETICIÓN: el
 * formulario manda «1» y `addLine` sumaba sin techo, así que veintiún clics
 * dejaban la línea en 21. Entonces el selector de la página del carrito
 * —que genera opciones 1..20— recibía un `defaultValue` que no existe, el
 * navegador seleccionaba «1», y quien pulsara «Actualizar» sin tocar nada se
 * dejaba veinte unidades por el camino.
 *
 * Así que el tope tiene que estar donde se GUARDA y no donde se pide. Pero
 * «donde se guarda» son N motores: el nativo hoy, el alojado mañana. Un
 * carrito de Shopify con 500 unidades en una línea rompe exactamente la
 * misma vista. Ponerlo en el motor nativo lo dejaba, además, fuera del
 * alcance de la app: `apps/**` no puede nombrar un adaptador
 * (`adapters-are-not-imported-by-routes`), y la acción de servidor y el
 * selector lo necesitan los dos.
 *
 * No es una regla de negocio: es cordura sobre lo que una línea puede
 * contener. El stock lo comprueba el checkout, no esto.
 */
export const MAX_CART_LINE_QUANTITY = 20;
