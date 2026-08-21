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
