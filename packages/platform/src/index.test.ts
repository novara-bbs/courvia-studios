import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  CURRENCY_MINOR_UNITS,
  DEFAULT_LOCALE,
  DEFAULT_MARKET,
  DEFAULT_REGION,
  LOCALES,
  LOCALE_DEFINITIONS,
  MARKETS,
  MARKET_DEFINITIONS,
  PREPARED_REGIONS,
  PUBLISHED_REGIONS,
  REGIONS,
  REGION_DEFINITIONS,
  REGION_STATUSES,
  SPORTS,
  isCurrency,
  isLocaleId,
  isMarketId,
  isPublishedRegion,
  isRegionId,
  isSport,
  publishedRegionFor,
} from "./index";

describe("registry totality", () => {
  it("defines every locale, market and region exactly once", () => {
    expect(Object.keys(LOCALE_DEFINITIONS).sort()).toEqual([...LOCALES].sort());
    expect(Object.keys(MARKET_DEFINITIONS).sort()).toEqual([...MARKETS].sort());
    expect(Object.keys(REGION_DEFINITIONS).sort()).toEqual([...REGIONS].sort());
    expect(Object.keys(CURRENCY_MINOR_UNITS).sort()).toEqual([...CURRENCIES].sort());
  });

  it("keeps every default inside its own registry", () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
    expect(MARKETS).toContain(DEFAULT_MARKET);
    expect(REGIONS).toContain(DEFAULT_REGION);
  });
});

describe("regions", () => {
  it("agrees with the locale and market registries it composes", () => {
    for (const region of Object.values(REGION_DEFINITIONS)) {
      expect(LOCALE_DEFINITIONS[region.locale]).toBeDefined();
      expect(MARKET_DEFINITIONS[region.market]).toBeDefined();
      // Currency belongs to the market, never to the language.
      expect(region.currency).toBe(MARKET_DEFINITIONS[region.market].currency);
      // Direction belongs to the language, never to the market.
      expect(region.dir).toBe(LOCALE_DEFINITIONS[region.locale].dir);
    }
  });

  it("keeps locale and market independent — the whole reason regions exist", () => {
    // en-gb and en-ae share a language but are different markets, so they
    // need distinct indexable URLs; a market cookie could not be indexed.
    expect(REGION_DEFINITIONS["en-gb"].locale).toBe(REGION_DEFINITIONS["en-ae"].locale);
    expect(REGION_DEFINITIONS["en-gb"].market).not.toBe(REGION_DEFINITIONS["en-ae"].market);
    expect(REGION_DEFINITIONS["en-gb"].currency).not.toBe(REGION_DEFINITIONS["en-ae"].currency);
    // ar-ae and en-ae share a market but differ in language and direction.
    expect(REGION_DEFINITIONS["ar-ae"].market).toBe(REGION_DEFINITIONS["en-ae"].market);
    expect(REGION_DEFINITIONS["ar-ae"].dir).toBe("rtl");
  });

  it("gives every region a unique hreflang", () => {
    const tags = Object.values(REGION_DEFINITIONS).map((r) => r.hreflang);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("publication status", () => {
  it("makes every region declare one, so a new region cannot forget to", () => {
    // Totality is the point: `status` is required on RegionDefinition, so a
    // region added without deciding whether it is real does not compile.
    for (const region of REGIONS) {
      expect(REGION_STATUSES).toContain(REGION_DEFINITIONS[region].status);
    }
  });

  it("splits the registry in two without losing or duplicating a region", () => {
    expect([...PUBLISHED_REGIONS, ...PREPARED_REGIONS].sort()).toEqual([...REGIONS].sort());
    expect(PUBLISHED_REGIONS.some((r) => PREPARED_REGIONS.includes(r))).toBe(false);
    for (const region of PUBLISHED_REGIONS) expect(isPublishedRegion(region)).toBe(true);
    for (const region of PREPARED_REGIONS) expect(isPublishedRegion(region)).toBe(false);
  });

  it("keeps at least one published region, and makes the default one of them", () => {
    // x-default points at DEFAULT_REGION. A noindex x-default would break
    // the whole cluster, not just its own row.
    expect(PUBLISHED_REGIONS.length).toBeGreaterThan(0);
    expect(isPublishedRegion(DEFAULT_REGION)).toBe(true);
  });

  it("holds ar-ae back until the Arabic content exists (ADR-09)", () => {
    // The seeded content is es/en only, so /ar-ae serves the Spanish
    // fallback under lang="ar". Publishing Arabic is flipping this value.
    expect(REGION_DEFINITIONS["ar-ae"].status).toBe("prepared");
    expect(REGION_DEFINITIONS.es.status).toBe("published");
    expect(REGION_DEFINITIONS["en-gb"].status).toBe("published");
    expect(REGION_DEFINITIONS["en-ae"].status).toBe("published");
  });

  it("keeps the RTL work alive: a prepared region is still a full region", () => {
    // Prepared means undeclared, NOT removed. The route, the direction and
    // the message catalogue must survive, or the RTL layout stops being
    // exercised by anything.
    for (const region of PREPARED_REGIONS) {
      expect(REGIONS).toContain(region);
      expect(isRegionId(region)).toBe(true);
      expect(REGION_DEFINITIONS[region].hreflang).not.toBe("");
    }
  });

  it("always resolves a published region to land negotiation on", () => {
    for (const region of REGIONS) {
      expect(isPublishedRegion(publishedRegionFor(region))).toBe(true);
    }
    // Published regions are never redirected away from themselves.
    for (const region of PUBLISHED_REGIONS) {
      expect(publishedRegionFor(region)).toBe(region);
    }
    // ar-ae falls to the same MARKET, not to the default: an Arabic speaker
    // in the UAE gets UAE pricing in English, not Spain in Spanish.
    expect(publishedRegionFor("ar-ae")).toBe("en-ae");
    expect(REGION_DEFINITIONS[publishedRegionFor("ar-ae")].market).toBe(
      REGION_DEFINITIONS["ar-ae"].market,
    );
  });
});

describe("guards", () => {
  it("accept members and reject everything else, including prototype keys", () => {
    expect(isSport("padel")).toBe(true);
    expect(isSport("golf")).toBe(false);
    expect(isLocaleId("ar")).toBe(true);
    expect(isMarketId("uk")).toBe(true);
    expect(isCurrency("AED")).toBe(true);
    expect(isRegionId("en-ae")).toBe(true);

    for (const guard of [isSport, isLocaleId, isMarketId, isCurrency, isRegionId]) {
      expect(guard("toString")).toBe(false);
      expect(guard("constructor")).toBe(false);
      expect(guard(undefined)).toBe(false);
      expect(guard(null)).toBe(false);
      expect(guard(42)).toBe(false);
    }
  });
});

describe("currencies", () => {
  it("never assumes 100 minor units — a future JPY market would break that", () => {
    for (const currency of CURRENCIES) {
      expect(CURRENCY_MINOR_UNITS[currency]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(CURRENCY_MINOR_UNITS[currency])).toBe(true);
    }
  });
});

describe("sports", () => {
  it("carries the three racquet sports as an attribute vocabulary (ADR-04)", () => {
    expect([...SPORTS]).toEqual(["tenis", "padel", "pickleball"]);
  });
});
