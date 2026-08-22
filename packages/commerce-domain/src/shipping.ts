/**
 * Cuánto cuesta llevarlo, y por qué esto es aritmética y no un motor.
 *
 * ---------------------------------------------------------------------------
 * QUÉ ES ESTO Y QUÉ NO ES
 * ---------------------------------------------------------------------------
 *
 * Es una **tarifa plana por mercado, con umbral de envío gratis**. Nada más.
 * No pesa el paquete, no consulta al transportista, no calcula zonas dentro
 * de un país y no sabe qué es un pallet.
 *
 * Y es a propósito, por la regla de §2 de CLAUDE.md: lo genérico y resuelto
 * por un SaaS maduro se compra. Un motor de tarifas propio sería justo eso —
 * salvo que en Fase 1 no hay a quién consultar: los tres mercados se sirven
 * **DDP desde España** (ADR-08), con courier-broker, y el precio que ve el
 * cliente es una decisión comercial, no una cotización. Cuando haya
 * transportista con API, esto se sustituye por un adaptador y la firma de
 * `quoteShipping` no cambia: entra un mercado y un subtotal, sale un importe.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ VIVE EN EL DOMINIO
 * ---------------------------------------------------------------------------
 *
 * Porque tres sitios necesitan la MISMA respuesta y no pueden discrepar: la
 * página del carrito, que la enseña; `createCheckout`, que la cobra; y la
 * factura, que la desglosa. Un carrito que dice «envío gratis» y un cargo que
 * suma 9,90 € es una reclamación, y la forma de que eso no pase es que no
 * haya dos cálculos.
 *
 * Puro y sin dependencias: el importe autoritativo lo calcula el servidor
 * (§4), pero la FUNCIÓN es la misma que usa la vista.
 */
import type { Currency, MarketId } from "@courvia/platform";

import { money, zero } from "./money";
import type { Money } from "./money";

/**
 * Lo que un mercado cobra por enviar, en unidades menores de SU moneda.
 *
 * La moneda no está aquí y no es un olvido: la manda el mercado
 * (`MARKET_DEFINITIONS`), y ADR-05 dice que un precio no se convierte nunca.
 * Un campo de moneda editable en el panel sería la puerta para configurar un
 * envío en euros sobre un pedido en dirhams.
 */
export interface ShippingRate {
  /** Tarifa plana, en unidades menores. `0` es envío gratis siempre. */
  readonly flatAmount: number;
  /**
   * Subtotal a partir del cual el envío es gratis, en unidades menores.
   * Ausente = no hay umbral. **Se compara con `>=`**: «gratis a partir de
   * 100 €» significa que 100,00 € exactos ya son gratis, que es lo que
   * entiende quien lo lee.
   */
  readonly freeOver?: number;
}

/** Lo que sale: un importe y por qué es ese importe. */
export interface ShippingQuote {
  readonly amount: Money;
  /**
   * Por qué vale eso. Lo consume la vista para decidir qué decir, no para
   * pintarlo: las cadenas visibles viven en next-intl o en Payload, nunca en
   * un paquete (`.claude/rules/design-system.md`).
   *
   *  - `flat` — se cobra la tarifa del mercado.
   *  - `free_threshold` — el subtotal llegó al umbral.
   *  - `free_always` — este mercado no cobra envío.
   *  - `unconfigured` — **no se sabe**, y no es cero.
   */
  readonly reason: "flat" | "free_threshold" | "free_always" | "unconfigured";
}

/**
 * La tarifa de un mercado, o `undefined` si nadie la ha configurado.
 *
 * `undefined` no se rellena con cero en ninguna capa. Un mercado sin tarifa
 * configurada no es un mercado con envío gratis: es un mercado que no debería
 * estar cobrando, y `createCheckout` lo rechaza en vez de regalar el porte —
 * el mismo criterio que `Availability.available`, donde un `?? 0` convertía
 * «no lo sé» en una afirmación.
 */
export type ShippingRates = Partial<Record<MarketId, ShippingRate>>;

export function quoteShipping(
  market: MarketId,
  subtotal: Money,
  rates: ShippingRates,
  currency: Currency,
): ShippingQuote {
  const rate = rates[market];
  if (rate === undefined) return { amount: zero(currency), reason: "unconfigured" };
  if (rate.flatAmount === 0) return { amount: zero(currency), reason: "free_always" };
  if (rate.freeOver !== undefined && subtotal.amount >= rate.freeOver) {
    return { amount: zero(currency), reason: "free_threshold" };
  }
  return { amount: money(rate.flatAmount, currency), reason: "flat" };
}

/** Cuánto falta para el envío gratis, o `null` si no aplica.
 *
 *  Lo pide la vista («te faltan 40 € para el envío gratis»), y se calcula
 *  aquí para que ese número salga de la misma regla que decide si es gratis.
 *  Un mercado sin tarifa contesta `null`: no se puede prometer un umbral que
 *  nadie ha configurado. */
export function amountToFreeShipping(
  market: MarketId,
  subtotal: Money,
  rates: ShippingRates,
  currency: Currency,
): Money | null {
  const rate = rates[market];
  if (rate?.freeOver === undefined || rate.flatAmount === 0) return null;
  const missing = rate.freeOver - subtotal.amount;
  return missing > 0 ? money(missing, currency) : null;
}
