/**
 * Shopify → domain translation. Every function here is a place where the
 * two models disagree, and the disagreement is documented rather than
 * smoothed over.
 */
import { CURRENCY_MINOR_UNITS, MARKET_DEFINITIONS, SPORTS } from "@courvia/platform";
import type { Currency, MarketId, Sport } from "@courvia/platform";
import { money } from "@courvia/commerce-domain";
import type { Money, Product, ProductImage, Spec, Variant } from "@courvia/commerce-domain";

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
 * Shopify's stock answer, as an integer the port can carry.
 *
 * `quantityAvailable` exists only when a shop publishes inventory levels to
 * the Storefront API; the default answer is the boolean `availableForSale`.
 * So the number below is a PRESENCE FLAG whenever the count is absent, and
 * any UI that renders "only 1 left" from it would be lying. ADR-024 §3.1
 * records this as the leak the port cannot paper over: `Availability` says
 * integer because our own stock ledger has one, and a hosted catalog does
 * not have to.
 */
export function toAvailable(variant: ShopifyVariant): number {
  if (typeof variant.quantityAvailable === "number") {
    return Math.max(0, Math.trunc(variant.quantityAvailable));
  }
  return variant.availableForSale ? 1 : 0;
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

/** The currency Shopify is expected to quote for a market. */
export function marketCurrency(market: MarketId): Currency {
  return MARKET_DEFINITIONS[market].currency;
}
