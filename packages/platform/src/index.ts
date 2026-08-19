/**
 * @courvia/platform — the vocabulary every other layer shares.
 *
 * Deliberately dependency-free and framework-free: i18n routing, the design
 * system, the commerce domain and the CMS all need to agree on what a sport,
 * a locale, a market and a currency are. Putting these in the commerce domain
 * would force the i18n layer to import commerce just to learn which languages
 * exist.
 */

/* ------------------------------------------------------------------ sports */

export const SPORTS = ["tenis", "padel", "pickleball"] as const;
export type Sport = (typeof SPORTS)[number];

/* ----------------------------------------------------------------- locales */

export const LOCALES = ["es", "en", "ar"] as const;
export type LocaleId = (typeof LOCALES)[number];

export type Direction = "ltr" | "rtl";

export interface LocaleDefinition {
  id: LocaleId;
  /** BCP-47 tag used for `lang` and for Intl formatting. */
  tag: string;
  dir: Direction;
}

export const LOCALE_DEFINITIONS: Record<LocaleId, LocaleDefinition> = {
  es: { id: "es", tag: "es", dir: "ltr" },
  en: { id: "en", tag: "en", dir: "ltr" },
  ar: { id: "ar", tag: "ar", dir: "rtl" },
};

export const DEFAULT_LOCALE: LocaleId = "es";

/* -------------------------------------------------------------- currencies */

export const CURRENCIES = ["EUR", "GBP", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Minor units per major unit. None of our currencies is zero-decimal today,
 * but pricing code must never assume 100 — a fourth market could be JPY.
 */
export const CURRENCY_MINOR_UNITS: Record<Currency, number> = {
  EUR: 2,
  GBP: 2,
  AED: 2,
};

/* ----------------------------------------------------------------- markets */

export const MARKETS = ["es", "uk", "ae"] as const;
export type MarketId = (typeof MARKETS)[number];

/** Who pays duties and import VAT at the border. */
export type Incoterm = "DDP" | "DDU";

export interface MarketDefinition {
  id: MarketId;
  /** Presentment currency; prices are fixed per currency, never converted. */
  currency: Currency;
  incoterm: Incoterm;
}

export const MARKET_DEFINITIONS: Record<MarketId, MarketDefinition> = {
  es: { id: "es", currency: "EUR", incoterm: "DDP" },
  uk: { id: "uk", currency: "GBP", incoterm: "DDP" },
  ae: { id: "ae", currency: "AED", incoterm: "DDP" },
};

export const DEFAULT_MARKET: MarketId = "es";

/* ----------------------------------------------------------------- regions */

/**
 * A region is one (locale, market) pair with its own indexable URL segment.
 * Locale is NOT market: en-gb and en-ae share a language but differ in
 * currency, tax, shipping and SEO, so they are distinct routes rather than a
 * language plus a cookie — a cookie cannot be indexed and would force dynamic
 * rendering of every priced page.
 */
export const REGIONS = ["es", "en-gb", "en-ae", "ar-ae"] as const;
export type RegionId = (typeof REGIONS)[number];

export interface RegionDefinition {
  id: RegionId;
  locale: LocaleId;
  market: MarketId;
  currency: Currency;
  dir: Direction;
  /** Value for the `hreflang` attribute. */
  hreflang: string;
}

export const REGION_DEFINITIONS: Record<RegionId, RegionDefinition> = {
  es: { id: "es", locale: "es", market: "es", currency: "EUR", dir: "ltr", hreflang: "es-ES" },
  "en-gb": { id: "en-gb", locale: "en", market: "uk", currency: "GBP", dir: "ltr", hreflang: "en-GB" },
  "en-ae": { id: "en-ae", locale: "en", market: "ae", currency: "AED", dir: "ltr", hreflang: "en-AE" },
  "ar-ae": { id: "ar-ae", locale: "ar", market: "ae", currency: "AED", dir: "rtl", hreflang: "ar-AE" },
};

/** Region served when negotiation finds no better match. */
export const DEFAULT_REGION: RegionId = "es";

/* -------------------------------------------------------- payment providers */

/**
 * Known payment gateways. Lives here rather than in the payment port because
 * MarketSettings (CMS) and the checkout UI both need the vocabulary, and a
 * market config importing the payment module created a dependency cycle.
 */
export const PAYMENT_PROVIDERS = ["stripe", "tabby", "tamara", "adyen"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export function isPaymentProviderId(value: unknown): value is PaymentProviderId {
  return typeof value === "string" && (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ guards */

export function isSport(value: unknown): value is Sport {
  return typeof value === "string" && (SPORTS as readonly string[]).includes(value);
}

export function isLocaleId(value: unknown): value is LocaleId {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isMarketId(value: unknown): value is MarketId {
  return typeof value === "string" && (MARKETS as readonly string[]).includes(value);
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}
