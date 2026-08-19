import { describe, expect, it } from "vitest";

import {
  CurrencyMismatchError,
  add,
  allocate,
  compare,
  equals,
  format,
  isNegative,
  isZero,
  money,
  multiply,
  subtract,
  sum,
  zero,
} from "./money";

describe("construction", () => {
  it("refuses non-integer amounts — minor units only, never floats", () => {
    expect(() => money(12.5, "EUR")).toThrow(TypeError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "EUR")).toThrow(TypeError);
    expect(money(1290_00, "EUR").amount).toBe(129000);
  });
});

describe("currency safety", () => {
  it("refuses to combine different currencies", () => {
    expect(() => add(money(100, "EUR"), money(100, "GBP"))).toThrow(CurrencyMismatchError);
    expect(() => subtract(money(100, "EUR"), money(100, "AED"))).toThrow(CurrencyMismatchError);
    expect(() => compare(money(100, "EUR"), money(100, "GBP"))).toThrow(CurrencyMismatchError);
  });

  it("treats identical amounts in different currencies as unequal", () => {
    expect(equals(money(100, "EUR"), money(100, "GBP"))).toBe(false);
    expect(equals(money(100, "EUR"), money(100, "EUR"))).toBe(true);
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and multiplies by whole quantities", () => {
    expect(add(money(100, "EUR"), money(250, "EUR")).amount).toBe(350);
    expect(subtract(money(100, "EUR"), money(250, "EUR")).amount).toBe(-150);
    expect(multiply(money(129_000, "EUR"), 3).amount).toBe(387_000);
    expect(() => multiply(money(100, "EUR"), 1.5)).toThrow(TypeError);
  });

  it("sums an empty list to zero of the given currency", () => {
    expect(sum([], "AED")).toEqual(zero("AED"));
    expect(isZero(zero("AED"))).toBe(true);
    expect(isNegative(money(-1, "EUR"))).toBe(true);
  });
});

describe("allocate", () => {
  it("loses nothing to rounding — the classic 5 cents across 3 lines", () => {
    const parts = allocate(money(5, "EUR"), [1, 1, 1]);
    expect(parts.map((p) => p.amount)).toEqual([2, 2, 1]);
    expect(sum(parts, "EUR").amount).toBe(5);
  });

  it("splits proportionally and still reconciles exactly", () => {
    const parts = allocate(money(10_000, "EUR"), [3, 7]);
    expect(parts.map((p) => p.amount)).toEqual([3000, 7000]);
    expect(sum(parts, "EUR").amount).toBe(10_000);
  });

  it("reconciles for awkward ratios", () => {
    const parts = allocate(money(1_00, "EUR"), [1, 1, 1, 1, 1, 1, 1]);
    expect(sum(parts, "EUR").amount).toBe(100);
    expect(parts).toHaveLength(7);
  });

  it("handles negative amounts (refunds) without losing a unit", () => {
    const parts = allocate(money(-5, "EUR"), [1, 1, 1]);
    expect(sum(parts, "EUR").amount).toBe(-5);
    expect(parts.every((p) => p.amount <= 0)).toBe(true);
  });

  it("rejects degenerate ratios", () => {
    expect(() => allocate(money(100, "EUR"), [])).toThrow(RangeError);
    expect(() => allocate(money(100, "EUR"), [0, 0])).toThrow(RangeError);
    expect(() => allocate(money(100, "EUR"), [-1, 2])).toThrow(RangeError);
  });
});

describe("format", () => {
  it("renders minor units as a localized major-unit string", () => {
    // Grouping separators and spaces vary across ICU builds, so assert on
    // the parts that are stable: major units, decimals and the symbol.
    const eur = format(money(129_000, "EUR"), "es-ES");
    expect(eur.replace(/\D/g, "")).toBe("129000");
    expect(eur).toContain("€");
    expect(eur).toContain(",00");

    const gbp = format(money(112_000, "GBP"), "en-GB");
    expect(gbp.replace(/\D/g, "")).toBe("112000");
    expect(gbp).toContain("£");
    expect(gbp).toContain(".00");
  });
});
