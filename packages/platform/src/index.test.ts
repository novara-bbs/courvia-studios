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
  REGIONS,
  REGION_DEFINITIONS,
  SPORTS,
  isCurrency,
  isLocaleId,
  isMarketId,
  isRegionId,
  isSport,
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
