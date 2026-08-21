/**
 * Shopify → domain translation. Every function here is a place where the
 * two models disagree, and the disagreement is documented rather than
 * smoothed over.
 */
import { CURRENCY_MINOR_UNITS, MARKET_DEFINITIONS, SPORTS } from "@courvia/platform";
import type { Currency, MarketId, Sport } from "@courvia/platform";
import {
  COMMERCE_SERVICE_ASSUMED_PRECISION,
  UNKNOWN_AVAILABILITY,
  booleanAvailability,
  exactAvailability,
  isAllowedUnder,
  matchAvailability,
  money,
} from "@courvia/commerce-domain";
import type {
  AvailabilityPrecision,
  AvailabilityView,
  Money,
  Product,
  ProductFilter,
  ProductImage,
  ProductSummary,
  Spec,
  Variant,
} from "@courvia/commerce-domain";

import { StorefrontError } from "./storefront";
import type { ShopifyImage, ShopifyMoney, ShopifyProduct, ShopifyVariant } from "./storefront";

/** ISO country per market, for Shopify's `@inContext(country:)` directive. */
const MARKET_COUNTRY: Record<MarketId, string> = { es: "ES", uk: "GB", ae: "AE" };

/** Language per market. Shopify contexts are (country, language) pairs. */
const MARKET_LANGUAGE: Record<MarketId, string> = { es: "ES", uk: "EN", ae: "EN" };

export function marketContext(market: MarketId): { country: string; language: string } {
  return { country: MARKET_COUNTRY[market], language: MARKET_LANGUAGE[market] };
}

function isCurrency(value: string): value is Currency {
  return value in CURRENCY_MINOR_UNITS;
}

/**
 * `"1290.00"` → 129000 minor units.
 *
 * Deliberately string arithmetic. `Math.round(parseFloat("1290.10") * 100)`
 * is the classic way to ship a one-cent error into an invoice, and a
 * commerce adapter is the last place to accept one: floats cannot represent
 * 0.1, so the product drifts and the direction of the drift depends on the
 * value. Splitting on the decimal point and padding is exact for every
 * amount Shopify can emit.
 */
export function toMinorUnits(value: ShopifyMoney): Money {
  if (!isCurrency(value.currencyCode)) {
    throw new StorefrontError(
      `Shopify returned ${value.currencyCode}, which is not a Courvia currency`,
    );
  }
  const exponent = CURRENCY_MINOR_UNITS[value.currencyCode];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.amount.trim());
  if (match === null) {
    throw new StorefrontError(`Shopify returned an unparseable amount: ${value.amount}`);
  }
  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) {
    // Shopify sends more precision than the currency has. Rounding here
    // would invent a price; the caller must fix the shop's price list.
    throw new StorefrontError(
      `Shopify returned ${value.amount} ${value.currencyCode}, finer than the currency's ${exponent} decimals`,
    );
  }
  const minor = `${whole}${fraction.padEnd(exponent, "0").slice(0, exponent)}`;
  return money(Number(`${sign}${minor}`), value.currencyCode);
}

/**
 * Shopify's stock answer, in the shape THIS CONNECTION is allowed to claim
 * (ADR-029, plan invariant 16).
 *
 * Two facts have to meet here and neither one alone decides:
 *
 * 1. **What the shop published.** `quantityAvailable` exists only when the
 *    shop publishes inventory levels to the Storefront API and the token
 *    carries the scope; the default answer is the boolean `availableForSale`.
 *    So "Shopify is boolean" is as false as the old `1` was — it depends on
 *    the shop.
 * 2. **What the connection declared.** `AvailabilityPrecision` is a CEILING,
 *    not a promise (`availability.ts`). An `exact` connection may degrade to
 *    boolean when a variant carries no count; a `boolean` connection may not
 *    climb, even if a count leaks into the payload — it declared it cannot
 *    count, and the type `AvailabilityView<"boolean">` has no exact branch.
 *
 * What never happens either way: a number nobody counted. Where the count is
 * absent the answer is `booleanAvailability(availableForSale)`, and a SKU the
 * shop does not know is `unknown` rather than a zero the storefront would
 * paint as "sold out".
 */
export function toAvailabilityView<P extends AvailabilityPrecision>(
  variant: ShopifyVariant | undefined,
  precision: P,
): AvailabilityView<P> {
  const view = viewUnder(variant, precision);
  assertUnder(view, precision);
  return view;
}

/**
 * The one narrowing in this package, and it is CHECKED rather than asserted:
 * `isAllowedUnder` is the runtime twin of the conditional type, so a mapping
 * that ever climbed above its declared ceiling would throw here instead of
 * reaching a PDP. TypeScript cannot prove the relation while `P` is still a
 * free parameter; this is what stands in for the proof.
 */
function assertUnder<P extends AvailabilityPrecision>(
  view: AvailabilityView,
  precision: P,
): asserts view is AvailabilityView<P> {
  if (!isAllowedUnder(view, precision)) {
    throw new StorefrontError(
      `mapped a "${view.kind}" availability under a "${precision}" connection`,
    );
  }
}

/**
 * Lo que el techo declarado NO protege, y conviene saberlo antes de la Fase 6.
 *
 * `isAllowedUnder` y el tipo condicional acotan la FAMILIA de formas que una
 * conexión puede devolver. Ninguno de los dos sabe si el número que va dentro
 * de una vista exacta se contó o se inventó. Medido: poner
 * `availableForSale ? 1 : 0` **solo dentro de la rama exacta** respeta el
 * techo, pasa el tipo, y pasa las tres suites de contrato. Los únicos que lo
 * cazan son los tests que afirman la FORMA concreta de la vista para una
 * variante sin `quantityAvailable`, y por eso existen.
 *
 * Cuando el cliente real de la Storefront API sustituya a las fixtures, la
 * trampa sigue ahí: el sitio donde se decide es este, y la red no la cierra.
 */
function viewUnder(
  variant: ShopifyVariant | undefined,
  precision: AvailabilityPrecision,
): AvailabilityView {
  // A SKU this shop has never heard of is not sold out. It is unknown, and
  // saying so lets the storefront show an editorial CTA (ADR-029) instead of
  // an "agotado" nobody checked.
  if (variant === undefined || precision === "unknown") return UNKNOWN_AVAILABILITY;
  const counted = variant.quantityAvailable;
  if (precision === "exact" && typeof counted === "number") {
    return exactAvailability(Math.max(0, Math.trunc(counted)));
  }
  return booleanAvailability(variant.availableForSale);
}

/**
 * The same answer squeezed into the legacy facade's integer.
 *
 * `CommerceService.getAvailability` returns `Availability { available:
 * number }`, so its precision is always exact — the domain says as much in
 * `COMMERCE_SERVICE_ASSUMED_PRECISION`. When the shop published no count
 * there is no honest integer to give it, and the `1` below is the presence
 * flag ADR-024 §3.1 recorded as the leak the port cannot paper over.
 *
 * It survives ONLY here, feeding `ShopifyCommerceService`, and it is derived
 * from the honest view rather than computed beside it: there is one place
 * that decides what Shopify said about stock, and the lossy step is visible
 * as a fold that throws information away. The capability surface
 * (`ShopifyCatalogEngine`) never calls this.
 */
export function toAvailable(variant: ShopifyVariant): number {
  return matchAvailability(toAvailabilityView(variant, COMMERCE_SERVICE_ASSUMED_PRECISION), {
    exact: (quantity) => quantity,
    boolean: (available) => (available ? 1 : 0),
    unknown: () => 0,
  });
}

function toImage(image: ShopifyImage): ProductImage {
  return {
    url: image.url,
    alt: image.altText ?? "",
    ...(typeof image.width === "number" ? { width: image.width } : {}),
    ...(typeof image.height === "number" ? { height: image.height } : {}),
  };
}

/**
 * Specs from metafields.
 *
 * Note what does NOT survive the trip: `Spec.evidence`. Shopify has no
 * notion of "this figure is a design target until a bench proves it", so an
 * adapter can only read back whatever string the shop happened to store. The
 * evidence REGIME — a value no editor can publish without its state — lives
 * in our CMS, which is precisely why ADR-024 keeps content here even in the
 * hybrid shape.
 */
export function toSpecs(product: ShopifyProduct): Spec[] {
  const fields = (product.metafields ?? []).filter((f) => f !== null);
  return fields
    .filter((field) => field.namespace === "specs")
    .map((field) => {
      const parsed = JSON.parse(field.value) as {
        label?: string;
        value?: string;
        unit?: string;
      };
      return {
        key: field.key,
        label: parsed.label ?? field.key,
        value: parsed.value ?? "",
        ...(parsed.unit === undefined ? {} : { unit: parsed.unit }),
      };
    });
}

/**
 * Sport is a VARIANT attribute here (ADR-04) and a tag or option there. The
 * mapping reads a `sport:` tag and falls back to padel, because a variant
 * with no sport cannot be rendered at all — and a silent default is better
 * than a crash only if it is written down. It is, here.
 */
function toSport(product: ShopifyProduct, variant: ShopifyVariant): Sport {
  const option = variant.selectedOptions?.find((o) => o.name.toLowerCase() === "sport");
  const fromTag = (product.tags ?? [])
    .find((tag) => tag.startsWith("sport:"))
    ?.slice("sport:".length);
  const raw = (option?.value ?? fromTag ?? "padel").toLowerCase();
  // SPORTS is the platform vocabulary and its members are SPANISH ("tenis").
  // Reading it here rather than repeating the list is what keeps a fourth
  // sport from silently collapsing to padel.
  return SPORTS.includes(raw as Sport) ? (raw as Sport) : "padel";
}

export function toVariant(product: ShopifyProduct, variant: ShopifyVariant): Variant {
  const attributes: Record<string, string> = {};
  for (const option of variant.selectedOptions ?? []) attributes[option.name] = option.value;
  return {
    id: variant.id,
    productId: product.id,
    sku: variant.sku,
    sport: toSport(product, variant),
    attributes,
    ...(typeof variant.weight === "number" && variant.weightUnit === "KILOGRAMS"
      ? { weightKg: variant.weight }
      : {}),
  };
}

export function toProduct(product: ShopifyProduct): Product {
  return {
    id: product.id,
    slug: product.handle,
    title: product.title,
    sports: [...new Set(product.variants.map((v) => toSport(product, v)))],
    ...(product.description ? { excerpt: product.description } : {}),
    ...(product.descriptionHtml ? { description: product.descriptionHtml } : {}),
    images: product.images.map(toImage),
    ...(product.vendor
      ? { brand: { slug: product.vendor.toLowerCase().replace(/\s+/g, "-"), name: product.vendor } }
      : {}),
    specs: toSpecs(product),
    variantIds: product.variants.map((v) => v.id),
  };
}

/**
 * The filters Shopify was already asked for, applied again locally.
 *
 * Shopify filters by tag server-side and paginates by cursor; the fixture
 * fetcher does neither. Re-applying `slugs`, `sport`, `offset` and `limit`
 * here is what makes the same call answer the same way against both — and in
 * a real deployment it is the guarantee behind the wire query, because a tag
 * typo would otherwise widen a listing in silence.
 */
export function selectProducts(
  products: readonly ShopifyProduct[],
  filter: ProductFilter,
): ShopifyProduct[] {
  const matched = products.filter((product) => {
    if (filter.slugs !== undefined && !filter.slugs.includes(product.handle)) return false;
    if (filter.sport !== undefined) return toProduct(product).sports.includes(filter.sport);
    return true;
  });
  const offset = filter.offset ?? 0;
  return filter.limit === undefined
    ? matched.slice(offset)
    : matched.slice(offset, offset + filter.limit);
}

/** A grid card, priced in whatever currency the `@inContext` call quoted. */
export function toSummary(product: ShopifyProduct): ProductSummary {
  const mapped = toProduct(product);
  const fromPrice = product.variants
    .map((variant) => toMinorUnits(variant.price))
    .reduce<Money | null>(
      (lowest, price) => (lowest === null || price.amount < lowest.amount ? price : lowest),
      null,
    );
  return {
    id: mapped.id,
    slug: mapped.slug,
    title: mapped.title,
    sports: mapped.sports,
    ...(mapped.excerpt === undefined ? {} : { excerpt: mapped.excerpt }),
    ...(mapped.images?.[0] === undefined ? {} : { image: mapped.images[0] }),
    ...(mapped.brand === undefined ? {} : { brand: mapped.brand }),
    fromPrice,
  };
}

/** The currency Shopify is expected to quote for a market. */
export function marketCurrency(market: MarketId): Currency {
  return MARKET_DEFINITIONS[market].currency;
}
