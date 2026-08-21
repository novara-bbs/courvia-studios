/**
 * El traspaso al cobro (ADR-029).
 *
 * Un checkout nativo produce un **pedido nuestro** —una fila en `orders` que
 * la máquina de estados hará avanzar con `PaymentEvent` normalizados— y una
 * sesión de la pasarela, sea redirección o formulario embebido.
 *
 * Un checkout de Shopify produce una **URL alojada**. No hay pedido nativo,
 * no hay `PaymentEvent` y no hay total que hayamos calculado nosotros: el
 * pedido nace en Shopify cuando el cliente paga allí. La asimetría es el
 * contenido de este fichero, no un descuido: un `orderRef` en la rama
 * alojada sería exactamente el pedido fantasma que ADR-029 prohíbe, una fila
 * en `pending_payment` que ningún webhook nuestro va a mover jamás.
 *
 * Los `?: never` son la parte que de verdad sujeta la asimetría. TypeScript
 * solo revisa las propiedades sobrantes en literales frescos, así que sin
 * ellos bastaba construir el objeto en una variable auxiliar —lo que hace
 * cualquier adaptador real— para colar el `orderRef` sin un solo aviso. Está
 * medido en `engine-type-rules.test.ts`.
 */
import type { PaymentProviderId } from "@courvia/platform";

import type { CartRef, ExternalEngineKind, OrderRef } from "./engine";

export const CHECKOUT_HANDOFF_KINDS = [
  "native_provider_redirect",
  "native_embedded",
  "shopify_hosted",
] as const;
export type CheckoutHandoffKind = (typeof CHECKOUT_HANDOFF_KINDS)[number];

export type NativeCheckoutHandoffKind = "native_provider_redirect" | "native_embedded";
export type ExternalCheckoutHandoffKind = "shopify_hosted";

/** Pasarela alojada: el cliente sale a pagar y vuelve. */
export interface NativeProviderRedirectHandoff {
  readonly kind: "native_provider_redirect";
  readonly cartRef: CartRef<"native">;
  /** Nuestro pedido, ya en `pending_payment`. */
  readonly orderRef: OrderRef<"native">;
  /** Cuál de los proveedores del mercado eligió el cliente (ADR-14). */
  readonly provider: PaymentProviderId;
  readonly url: string;
  readonly checkoutUrl?: never;
}

/** Formulario de la pasarela dentro de nuestra página. */
export interface NativeEmbeddedHandoff {
  readonly kind: "native_embedded";
  readonly cartRef: CartRef<"native">;
  readonly orderRef: OrderRef<"native">;
  readonly provider: PaymentProviderId;
  readonly clientSecret: string;
  readonly checkoutUrl?: never;
}

/**
 * Checkout alojado por el motor externo. Sin `orderRef` y sin `provider`:
 * cuando Shopify está activo, Shopify controla checkout y pagos, y
 * `PaymentProvider` no pinta nada aquí.
 */
export interface ShopifyHostedHandoff {
  readonly kind: "shopify_hosted";
  readonly cartRef: CartRef<ExternalEngineKind>;
  readonly checkoutUrl: string;
  readonly orderRef?: never;
  readonly provider?: never;
  readonly url?: never;
  readonly clientSecret?: never;
}

export type NativeCheckoutHandoff = NativeProviderRedirectHandoff | NativeEmbeddedHandoff;
export type ExternalCheckoutHandoff = ShopifyHostedHandoff;

export type CheckoutHandoff = NativeCheckoutHandoff | ExternalCheckoutHandoff;

/** El traspaso que puede producir cada motor. */
export type CheckoutHandoffFor<E extends string> = E extends "native"
  ? NativeCheckoutHandoff
  : ExternalCheckoutHandoff;

export function isNativeHandoff(handoff: CheckoutHandoff): handoff is NativeCheckoutHandoff {
  return handoff.kind === "native_provider_redirect" || handoff.kind === "native_embedded";
}

export function isExternalHandoff(handoff: CheckoutHandoff): handoff is ExternalCheckoutHandoff {
  return handoff.kind === "shopify_hosted";
}

/**
 * A dónde mandar al navegador. `null` para el embebido, que no navega a
 * ninguna parte: se queda en nuestra página con el `clientSecret`.
 */
export function handoffRedirectUrl(handoff: CheckoutHandoff): string | null {
  switch (handoff.kind) {
    case "native_provider_redirect":
      return handoff.url;
    case "native_embedded":
      return null;
    case "shopify_hosted":
      return handoff.checkoutUrl;
  }
}
