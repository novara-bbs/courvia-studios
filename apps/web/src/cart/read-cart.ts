/**
 * El carrito, visto por la tienda.
 *
 * Una función de lectura, sin `"use server"`: la llaman la página del carrito
 * y nadie más. Las mutaciones viven en `actions.ts`, y esa separación no es
 * estilística — un módulo con `"use server"` expone TODAS sus exportaciones
 * como endpoint, así que un ayudante de lectura ahí dentro sería una API
 * pública sin querer.
 *
 * ---------------------------------------------------------------------------
 * Por qué esto no devuelve un `Cart` del dominio
 * ---------------------------------------------------------------------------
 *
 * Porque a la vista le falta la mitad de lo que necesita para pintar: el
 * `Cart` trae `sku` y `quantity`, no el título del producto ni su foto ni su
 * dirección. Devolver el `Cart` obligaría a la página a hacer N consultas de
 * catálogo, una por línea, dentro del JSX. `CartView` las hace en lote aquí.
 *
 * Y le falta una cosa más, que es la importante: si esta conexión **sabe
 * cobrar**. `runtime.checkout` es `null` mientras ninguna pasarela tenga
 * credenciales (ver la cabecera de `native-commerce-engine.ts`), y una página
 * de carrito con un botón de pagar que no paga es peor que una sin botón. El
 * estado se lee del motor, no de una bandera de configuración.
 */
import { MARKET_DEFINITIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { Currency, RegionId } from "@courvia/platform";
import { add, amountToFreeShipping, multiply, quoteShipping } from "@courvia/commerce-domain";
import type { Cart, Money, ShippingQuote } from "@courvia/commerce-domain";
import { getPayload } from "payload";
import config from "@payload-config";
import type { Where } from "payload";

import { CommerceRuntimeUnavailableError, commerce, getShippingRates } from "../server/container";
import { readCartSession } from "./session";

/** Una línea, ya con lo que hace falta para pintarla. */
export interface CartViewLine {
  /** El id de la variante en esta conexión. Es lo que mandan los formularios. */
  readonly variantId: string;
  readonly sku: string;
  readonly quantity: number;
  /** `null` cuando la variante no tiene precio activo en este mercado. */
  readonly unitAmount: Money | null;
  readonly lineTotal: Money | null;
  readonly productTitle: string;
  /** Ruta de la ficha, o `null` si el producto ya no es visitable. */
  readonly productHref: string | null;
}

export interface CartView {
  readonly lines: readonly CartViewLine[];
  /** Unidades, no líneas: es lo que dice el contador de la cabecera. */
  readonly units: number;
  readonly currency: Currency;
  /** `null` en cuanto una línea no se pueda sumar. Un subtotal parcial miente. */
  readonly subtotal: Money | null;
  /**
   * Si ESTA conexión declara `checkout_start`. Hoy es `false` en el nativo
   * —ninguna pasarela tiene credenciales— y decirlo es la diferencia entre
   * `code_complete` y fingir `launch_ready`.
   */
  readonly canCheckout: boolean;
  /**
   * Lo que costará el porte, **con la misma función que lo va a cobrar**.
   *
   * Un carrito que promete «envío gratis» y un cargo que suma 9,90 € es una
   * reclamación, y la única forma de que eso no ocurra es que no existan dos
   * cálculos: esto sale de `quoteShipping`, igual que el total de
   * `createCheckout`.
   *
   * `null` cuando el carrito está vacío (no hay nada que enviar) o cuando el
   * subtotal no se puede sumar — prometer un porte sobre un subtotal que
   * miente sería peor que callar.
   */
  readonly shipping: ShippingQuote | null;
  /**
   * Cuánto falta para el envío gratis, o `null` si no aplica. Lo pinta la
   * vista; lo decide la misma regla que el `shipping` de arriba.
   */
  readonly toFreeShipping: Money | null;
  /** Subtotal + envío. `null` con el subtotal en `null`, por lo mismo. */
  readonly total: Money | null;
}

export const EMPTY_CART: CartView = {
  lines: [],
  units: 0,
  currency: "EUR",
  subtotal: null,
  canCheckout: false,
  shipping: null,
  toFreeShipping: null,
  total: null,
};

function emptyFor(region: RegionId): CartView {
  return { ...EMPTY_CART, currency: MARKET_DEFINITIONS[REGION_DEFINITIONS[region].market].currency };
}

export function unitsOf(cart: Pick<Cart, "lines">): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

interface VariantProductRow {
  id: number | string;
  product: { id: number | string; slug: string; title: string } | number | string;
}

/**
 * Título y dirección de cada línea, en UNA consulta.
 *
 * `depth: 1` trae el producto de cada variante sin una segunda vuelta. Una
 * variante cuyo producto desapareció devuelve `productHref: null` en vez de
 * romper: el carrito sigue siendo legible y quitable, que es lo que necesita
 * quien lo tiene delante.
 */
async function decorate(
  cart: Cart,
  region: RegionId,
): Promise<readonly CartViewLine[]> {
  if (cart.lines.length === 0) return [];
  const payload = await getPayload({ config });
  const { locale } = REGION_DEFINITIONS[region];
  const result = await payload.find({
    collection: "variants",
    where: { id: { in: cart.lines.map((line) => Number(line.variant.externalId)) } } as Where,
    limit: 200,
    depth: 1,
    locale,
    overrideAccess: true,
  });
  const productByVariant = new Map(
    (result.docs as unknown as VariantProductRow[]).map((row) => [String(row.id), row.product]),
  );

  return cart.lines.map((line): CartViewLine => {
    const product = productByVariant.get(line.variant.externalId);
    const known = typeof product === "object" && product !== null;
    return {
      variantId: line.variant.externalId,
      sku: line.sku,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      // `multiply` y no una multiplicación a mano: la escala es una decisión
      // de la moneda (CURRENCY_MINOR_UNITS) y el lint del repositorio rechaza
      // tocar un importe fuera de `money.ts`, con razón.
      lineTotal: line.unitAmount === null ? null : multiply(line.unitAmount, line.quantity),
      productTitle: known ? product.title : line.sku,
      productHref: known ? `/${region}/robots/${product.slug}` : null,
    };
  });
}

/**
 * El carrito de este navegador, o uno vacío.
 *
 * Nunca lanza por culpa de una cookie: una sesión que ya no existe —barrida,
 * de otro despliegue, copiada a mano— produce un carrito vacío, no un 500.
 * Lo que sí deja pasar es un fallo real del motor, porque esconderlo haría
 * que un incidente de comercio se pareciese a un carrito vacío.
 */
export async function readCart(region: RegionId): Promise<CartView> {
  const sessionId = await readCartSession();
  if (sessionId === null) return emptyFor(region);

  let runtime;
  try {
    runtime = await commerce.forCart(sessionId);
  } catch (error) {
    if (
      error instanceof CommerceRuntimeUnavailableError &&
      error.problem === "cart_binding_unavailable"
    ) {
      return emptyFor(region);
    }
    throw error;
  }
  if (runtime.cart === null) return emptyFor(region);

  const cart = await runtime.cart.getCart({
    kind: "cart",
    engine: runtime.owner.engine,
    connectionKey: runtime.owner.connectionKey,
    externalId: sessionId,
  });
  if (cart === null) return emptyFor(region);

  const { market } = REGION_DEFINITIONS[region];
  const subtotal = cart.subtotal;
  // Un carrito vacío no paga porte, y un subtotal que no se puede sumar no
  // permite prometer ninguno: en los dos casos se calla en vez de enseñar un
  // número que luego no se parezca al cargo.
  const rates = cart.lines.length === 0 || subtotal === null ? null : await getShippingRates();
  const shipping =
    rates === null || subtotal === null
      ? null
      : quoteShipping(market, subtotal, rates, cart.currency);

  return {
    lines: await decorate(cart, region),
    units: unitsOf(cart),
    currency: cart.currency,
    subtotal,
    canCheckout: runtime.checkout !== null,
    shipping,
    toFreeShipping:
      rates === null || subtotal === null
        ? null
        : amountToFreeShipping(market, subtotal, rates, cart.currency),
    // `add` no: el subtotal ya es `Money` y el envío también, pero sumar aquí
    // con el operador saltaría el lint que prohíbe tocar un importe fuera de
    // `money.ts` — y con razón, porque la escala es de la moneda.
    total:
      subtotal === null || shipping === null
        ? subtotal
        : add(subtotal, shipping.amount),
  };
}
