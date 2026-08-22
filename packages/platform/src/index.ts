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
  /**
   * Días de desistimiento desde la ENTREGA, o `null` donde no hay un plazo
   * legal que aplicar.
   *
   * Es LEY, no configuración, y por eso está aquí y no en un Global editable
   * desde el panel: cambiarlo no es una decisión comercial. Las cifras salen
   * de `docs/markets.md` §«Desistimiento» y de ahí no se mueven sin abogado.
   *
   * `null` en EAU no es «cero días»: allí el plazo lo fija el contrato y la
   * ley de comercio electrónico, no un número uniforme, así que inventarle
   * uno sería peor que no tener ninguno. Quien consuma esto tiene que tratar
   * los dos casos —lo hace `openWithdrawalWindow`, en la app.
   *
   * **El caso español lleva trampa y conviene saberla:** el Art. 102 TRLGDCU
   * da 14 días, pero si NO se informa del derecho el plazo se convierte en
   * DOCE MESES. O sea, el riesgo de no implementar esto no era «no tener una
   * fecha»: era multiplicar el plazo por veintiséis.
   */
  withdrawalDays: number | null;
}

export const MARKET_DEFINITIONS: Record<MarketId, MarketDefinition> = {
  // Art. 102 TRLGDCU.
  es: { id: "es", currency: "EUR", incoterm: "DDP", withdrawalDays: 14 },
  // 14 días + Consumer Rights Act 2015.
  uk: { id: "uk", currency: "GBP", incoterm: "DDP", withdrawalDays: 14 },
  // Según contrato y Ley de comercio electrónico: no hay un número uniforme.
  ae: { id: "ae", currency: "AED", incoterm: "DDP", withdrawalDays: null },
};

export const DEFAULT_MARKET: MarketId = "es";

/* ----------------------------------------------------------------- regions */

/**
 * A region is one (locale, market) pair with its own URL segment.
 * Locale is NOT market: en-gb and en-ae share a language but differ in
 * currency, tax, shipping and SEO, so they are distinct routes rather than a
 * language plus a cookie — a cookie cannot be indexed and would force dynamic
 * rendering of every priced page.
 */
export const REGIONS = ["es", "en-gb", "en-ae", "ar-ae"] as const;
export type RegionId = (typeof REGIONS)[number];

/**
 * Whether a region is something we tell the world exists.
 *
 * `published` — the region is real: its content is written in its language,
 * it enters the sitemap, it is part of the hreflang cluster and it is
 * indexable.
 *
 * `prepared` — the route, the layout, the direction and the message
 * catalogue exist and are exercised by the build, but the CONTENT does not.
 * A prepared region is navigable and testable and is declared nowhere: no
 * sitemap entry, no hreflang annotation, no public selector link, `noindex`
 * on every page. Declaring `hreflang="ar-AE"` over pages that serve the
 * Spanish fallback is not an omission, it is a wrong statement — Search
 * Console reads it as an incorrect language alternate and the penalty
 * spreads to the sibling regions in the same cluster, which ARE real.
 *
 * Publishing is therefore one value in one row of REGION_DEFINITIONS, not a
 * literal repeated across sitemap, metadata, proxy and chrome.
 */
export const REGION_STATUSES = ["published", "prepared"] as const;
export type RegionStatus = (typeof REGION_STATUSES)[number];

export interface RegionDefinition {
  id: RegionId;
  locale: LocaleId;
  market: MarketId;
  currency: Currency;
  dir: Direction;
  /** Value for the `hreflang` attribute. */
  hreflang: string;
  /**
   * Declared, never derived. The honest condition would be "is there real
   * content in this language", but that lives in Postgres and every consumer
   * of this flag (sitemap, metadata, proxy, chrome) runs at build time,
   * where asking the database is exactly the silent coupling we are removing
   * elsewhere. A build-time proxy — "does its message catalogue exist" —
   * would be worse than useless: the catalogues cover UI chrome only, so a
   * complete ar.json would flip the region to published while every product
   * page still rendered the Spanish fallback. Going live is an editorial and
   * legal decision (ADR-09 puts the AR legal documents first); a human takes
   * it and writes it down here.
   */
  status: RegionStatus;
}

export const REGION_DEFINITIONS: Record<RegionId, RegionDefinition> = {
  es: {
    id: "es",
    locale: "es",
    market: "es",
    currency: "EUR",
    dir: "ltr",
    hreflang: "es-ES",
    status: "published",
  },
  "en-gb": {
    id: "en-gb",
    locale: "en",
    market: "uk",
    currency: "GBP",
    dir: "ltr",
    hreflang: "en-GB",
    status: "published",
  },
  "en-ae": {
    id: "en-ae",
    locale: "en",
    market: "ae",
    currency: "AED",
    dir: "ltr",
    hreflang: "en-AE",
    status: "published",
  },
  // ADR-09: Phase 1 serves the UAE in English; Arabic starts with the legal
  // and privacy documents and the commercial UI comes later. Until that
  // content exists this stays `prepared` — flipping this single value is the
  // whole of "publish Arabic".
  "ar-ae": {
    id: "ar-ae",
    locale: "ar",
    market: "ae",
    currency: "AED",
    dir: "rtl",
    hreflang: "ar-AE",
    status: "prepared",
  },
};

/** Region served when negotiation finds no better match. */
export const DEFAULT_REGION: RegionId = "es";

/**
 * The regions we declare: the sitemap's rows, the hreflang cluster, the
 * public selector's links. Derived from the table so the two lists cannot
 * disagree.
 */
export const PUBLISHED_REGIONS: readonly RegionId[] = REGIONS.filter(
  (region) => REGION_DEFINITIONS[region].status === "published",
);

/** Built and navigable, declared nowhere. */
export const PREPARED_REGIONS: readonly RegionId[] = REGIONS.filter(
  (region) => REGION_DEFINITIONS[region].status === "prepared",
);

export function isPublishedRegion(region: RegionId): boolean {
  return REGION_DEFINITIONS[region].status === "published";
}

/**
 * The region actually offered in place of `region` — itself when published,
 * otherwise the published region of the same market, and the default region
 * as the last resort. This is what language negotiation lands on: sending an
 * Arabic-speaking visitor to /ar-ae would be suggesting a page we have told
 * crawlers not to index and whose body is in Spanish, so they get /en-ae —
 * the same market, in the language we do publish (ADR-09).
 *
 * Negotiation still only ever SUGGESTS (docs/markets.md §9): a deep link to
 * a prepared region is never rewritten.
 */
export function publishedRegionFor(region: RegionId): RegionId {
  if (isPublishedRegion(region)) return region;
  const { market } = REGION_DEFINITIONS[region];
  return PUBLISHED_REGIONS.find((r) => REGION_DEFINITIONS[r].market === market) ?? DEFAULT_REGION;
}

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

/**
 * Payment METHODS a gateway can present (WooCommerce-style): Bizum and
 * Klarna ride inside Stripe in ES, Clearpay inside Stripe in UK, Apple Pay
 * everywhere Stripe is. The checkout paints them and createSession forwards
 * them as the gateway's payment_method_types equivalent; which methods a
 * market offers is configuration (MarketSettings), never code.
 */
export const PAYMENT_METHODS = [
  "card",
  "bizum",
  "klarna",
  "sequra",
  "clearpay",
  "apple_pay",
  "google_pay",
] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

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
