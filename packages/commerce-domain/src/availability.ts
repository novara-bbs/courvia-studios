/**
 * Disponibilidad honesta (invariante 16 del plan · ADR-029).
 *
 * El motor nativo cuenta unidades: `qty_on_hand - qty_committed` es un
 * entero. La Storefront API de Shopify, salvo que la tienda exponga
 * `quantityAvailable`, solo dice `availableForSale: true|false`. Hoy el
 * estudio `packages/commerce-shopify` resuelve el desacuerdo convirtiendo el
 * booleano en `1` (`mapping.ts:toAvailable`), y ese `1` acaba en pantalla
 * como «queda 1». No es un redondeo: es una cifra inventada sobre la que un
 * cliente decide comprar.
 *
 * Aquí la respuesta a "¿cuánto hay?" deja de ser un número y pasa a ser una
 * unión discriminada. Un renderer que quiera pintar una cantidad tiene que
 * demostrar antes que la tiene.
 *
 * Y la precisión se declara **por conexión**, no por motor: la misma Shopify
 * expone `quantityAvailable` si la tienda lo activa y el token tiene el
 * scope. Decir "Shopify es booleano" sería tan falso como el `1`.
 */

/* ------------------------------------------------------------ precisión */

export const AVAILABILITY_PRECISIONS = ["exact", "boolean", "unknown"] as const;

/**
 * Lo más fino que esta conexión puede afirmar. Es un techo, no una promesa:
 * una conexión `exact` puede degradar a booleano o a desconocido cuando su
 * inventario no responde, pero una `boolean` **no puede** subir a exacto.
 */
export type AvailabilityPrecision = (typeof AVAILABILITY_PRECISIONS)[number];

/* ------------------------------------------------------------- la vista */

/**
 * Hay tantas unidades. Solo lo declara quien las ha contado.
 *
 * `available?: never` no es ruido defensivo: sin él, un objeto construido en
 * una variable auxiliar (sin la comprobación de propiedades sobrantes que
 * TypeScript solo aplica a los literales frescos) podría llevar los dos
 * campos a la vez y compilar. Está medido: ver `engine-type-rules.test.ts`.
 */
export interface ExactAvailability {
  readonly kind: "exact";
  readonly quantity: number;
  readonly available?: never;
}

/** Se puede comprar o no. No hay cantidad y no se inventa. */
export interface BooleanAvailability {
  readonly kind: "boolean";
  readonly available: boolean;
  readonly quantity?: never;
}

/**
 * No se sabe. Es una respuesta legítima —el inventario no contesta, el SKU no
 * está mapeado— y es mejor que un `0`, que la tienda pintaría como agotado.
 */
export interface UnknownAvailability {
  readonly kind: "unknown";
  readonly quantity?: never;
  readonly available?: never;
}

export type AvailabilityKind = "exact" | "boolean" | "unknown";

/**
 * La vista de disponibilidad, acotada por la precisión declarada.
 *
 * `AvailabilityView` a secas es la unión completa: lo que consume un
 * renderer, que no sabe ni quiere saber de qué motor viene. Con el parámetro
 * puesto es lo que puede **devolver** un adaptador: `AvailabilityView<"boolean">`
 * no admite la rama exacta, así que un adaptador Shopify que declare
 * precisión booleana no puede devolver una cantidad ni equivocándose.
 */
export type AvailabilityView<P extends AvailabilityPrecision = AvailabilityPrecision> =
  P extends "exact"
    ? ExactAvailability | BooleanAvailability | UnknownAvailability
    : P extends "boolean"
      ? BooleanAvailability | UnknownAvailability
      : UnknownAvailability;

/** Qué formas puede tomar una vista bajo cada precisión. Gemelo en runtime
 *  del tipo condicional de arriba: lo usan las suites de contrato, que no
 *  pueden preguntarle a `tsc` en tiempo de ejecución. */
export const PRECISION_ALLOWS: Record<AvailabilityPrecision, readonly AvailabilityKind[]> = {
  exact: ["exact", "boolean", "unknown"],
  boolean: ["boolean", "unknown"],
  unknown: ["unknown"],
};

export function isAllowedUnder(view: AvailabilityView, precision: AvailabilityPrecision): boolean {
  return PRECISION_ALLOWS[precision].includes(view.kind);
}

/* ------------------------------------------------------ constructores */

/**
 * Solo para quien ha contado. Valida como `money()`: una cantidad que no es
 * un entero no negativo es un fallo de programación, no un dato.
 */
export function exactAvailability(quantity: number): ExactAvailability {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new TypeError(`Availability quantity must be a non-negative safe integer, got ${quantity}`);
  }
  return { kind: "exact", quantity };
}

export function booleanAvailability(available: boolean): BooleanAvailability {
  return { kind: "boolean", available };
}

export const UNKNOWN_AVAILABILITY: UnknownAvailability = { kind: "unknown" };

/* --------------------------------------------------------- consumo */

/**
 * La pregunta que **los dos motores** saben contestar. Un renderer pregunta
 * esto y no necesita un solo `if (engine === …)`: la respuesta depende de la
 * forma de la vista, no de quién la produjo.
 */
export const STOCK_SIGNALS = ["in_stock", "out_of_stock", "unknown"] as const;
export type StockSignal = (typeof STOCK_SIGNALS)[number];

export function stockSignal(view: AvailabilityView): StockSignal {
  switch (view.kind) {
    case "exact":
      return view.quantity > 0 ? "in_stock" : "out_of_stock";
    case "boolean":
      return view.available ? "in_stock" : "out_of_stock";
    case "unknown":
      return "unknown";
  }
}

/**
 * La cantidad, cuando existe. `null` significa "esta conexión no la sabe", y
 * el tipo de retorno obliga a tratarlo: `exactQuantity(v) > 0` no compila.
 */
export function exactQuantity(view: AvailabilityView): number | null {
  return view.kind === "exact" ? view.quantity : null;
}

/**
 * El aviso de "quedan pocas", que es donde nació la mentira.
 *
 * Devuelve la cantidad **solo** si se ha contado y está por debajo del
 * umbral. Con una vista booleana devuelve `null` siempre: no hay número que
 * enseñar, y el camino honesto es también el camino corto.
 */
export function lowStockRemaining(view: AvailabilityView, threshold: number): number | null {
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    throw new TypeError(`Low-stock threshold must be a positive safe integer, got ${threshold}`);
  }
  const quantity = exactQuantity(view);
  if (quantity === null || quantity <= 0 || quantity > threshold) return null;
  return quantity;
}

/**
 * Pliegue exhaustivo. Para lo que no sea "¿hay stock?" o "¿quedan pocas?", un
 * renderer declara las tres respuestas y el compilador le exige las tres:
 * añadir mañana una cuarta forma de disponibilidad pondría en rojo a todos
 * los consumidores, que es exactamente lo que debe pasar.
 */
export interface AvailabilityCases<T> {
  exact: (quantity: number) => T;
  boolean: (available: boolean) => T;
  unknown: () => T;
}

export function matchAvailability<T>(view: AvailabilityView, cases: AvailabilityCases<T>): T {
  switch (view.kind) {
    case "exact":
      return cases.exact(view.quantity);
    case "boolean":
      return cases.boolean(view.available);
    case "unknown":
      return cases.unknown();
  }
}

/** Disponibilidad de un SKU, en la forma que la conexión puede afirmar. */
export interface SkuAvailability<P extends AvailabilityPrecision = AvailabilityPrecision> {
  readonly sku: string;
  readonly view: AvailabilityView<P>;
}

/* ------------------------------------------------- la pregunta de siempre */

/**
 * ¿Hay para vender?
 *
 * Tres sitios respondían a esto con tres redacciones distintas sobre el mismo
 * `available`, y las tres estaban mal del mismo modo: `available > 0` sobre
 * un `?? 0`. Una variante sin fila de inventario —stock NO CONTROLADO— salía
 * agotada en la tabla de la PDP, sin botón de comprar, y como `OutOfStock` en
 * el JSON-LD que leen Google Shopping y cada comparador de precios.
 *
 * `null` no es un hueco: es «no lo cuento». Y lo que no se cuenta se vende —
 * el checkout es de la misma opinión, porque solo rechaza cuando conoce la
 * cifra y no llega. La cifra que no existe no puede quedarse corta.
 *
 * Vive en el dominio y no en la PDP porque la respuesta no es de una vista:
 * el JSON-LD la necesita igual, y el día que haya un motor alojado la
 * necesitará también con su propia forma de no contar.
 */
export function inStock(available: number | null): boolean {
  return available === null || available > 0;
}
