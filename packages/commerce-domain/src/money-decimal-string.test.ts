import { CURRENCIES, CURRENCY_MINOR_UNITS } from "@courvia/platform";
import { afterEach, describe, expect, it } from "vitest";

import { money, toDecimalString } from "./money";

describe("toDecimalString", () => {
  it("renders minor units as a bare decimal, no symbol and no grouping", () => {
    // Feeds and schema.org parse this string as a number: a thousands
    // separator or a currency symbol makes the offer unreadable, and a comma
    // decimal separator makes 1290,00 read as 129000.
    expect(toDecimalString(money(129_000, "EUR"))).toBe("1290.00");
    expect(toDecimalString(money(112_000, "GBP"))).toBe("1120.00");
    expect(toDecimalString(money(529_900, "AED"))).toBe("5299.00");
  });

  it("keeps the leading zero for amounts below one major unit", () => {
    expect(toDecimalString(money(5, "EUR"))).toBe("0.05");
    expect(toDecimalString(money(50, "EUR"))).toBe("0.50");
    expect(toDecimalString(money(0, "EUR"))).toBe("0.00");
  });

  it("keeps the sign on a refund line", () => {
    expect(toDecimalString(money(-129_000, "EUR"))).toBe("-1290.00");
    expect(toDecimalString(money(-5, "EUR"))).toBe("-0.05");
  });

  it("stays exact where float division would not", () => {
    // 8_010_000_000_000_02 / 100 is not representable in binary floating
    // point; the old `(amount / 100).toFixed(2)` loses the trailing cents.
    expect(toDecimalString(money(801_000_000_000_002, "EUR"))).toBe("8010000000000.02");
  });

  it("gives every currency exactly its own number of decimals", () => {
    for (const currency of CURRENCIES) {
      const decimals = toDecimalString(money(129_000, currency)).split(".")[1] ?? "";
      expect(decimals).toHaveLength(CURRENCY_MINOR_UNITS[currency]);
    }
  });
});

describe("toDecimalString scale is read, not assumed", () => {
  // The three currencies we sell in are all two-decimal, so no fixture can
  // tell a correct implementation from a hardcoded 100. Standing in a
  // zero-decimal currency is the only way to prove the registry is what
  // drives the scale — the JPY case CURRENCY_MINOR_UNITS exists for.
  const original = CURRENCY_MINOR_UNITS.EUR;
  afterEach(() => {
    CURRENCY_MINOR_UNITS.EUR = original;
  });

  it("emits no decimal point for a zero-decimal currency", () => {
    CURRENCY_MINOR_UNITS.EUR = 0;
    expect(toDecimalString(money(129_000, "EUR"))).toBe("129000");
  });

  it("emits three decimals for a three-decimal currency", () => {
    CURRENCY_MINOR_UNITS.EUR = 3;
    expect(toDecimalString(money(129_000, "EUR"))).toBe("129.000");
    expect(toDecimalString(money(5, "EUR"))).toBe("0.005");
  });
});
