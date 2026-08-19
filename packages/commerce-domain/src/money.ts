/**
 * Money — amounts in MINOR units (cents, pence, fils). Never floats.
 *
 * Arithmetic lives here and nowhere else: a lint rule forbids `*` and `/` on
 * `Money.amount` outside this file, so rounding decisions are made once and
 * are testable. Every operation refuses to mix currencies.
 */
import { CURRENCY_MINOR_UNITS } from "@courvia/platform";
import type { Currency } from "@courvia/platform";

export interface Money {
  /** Integer amount in minor units. */
  amount: number;
  currency: Currency;
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} with ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(`Money.amount must be a safe integer in minor units, got ${amount}`);
  }
  return { amount, currency };
}

export function zero(currency: Currency): Money {
  return { amount: 0, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: Currency): Money {
  return items.reduce<Money>((acc, item) => add(acc, item), zero(currency));
}

/** Multiply by a whole quantity (line totals). */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity)) {
    throw new TypeError(`Quantity must be an integer, got ${quantity}`);
  }
  return money(value.amount * quantity, value.currency);
}

export function isZero(value: Money): boolean {
  return value.amount === 0;
}

export function isNegative(value: Money): boolean {
  return value.amount < 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Compares two amounts of the same currency: negative, 0 or positive. */
export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount - b.amount;
}

/**
 * Splits an amount across `ratios` losing nothing to rounding: the remainder
 * is distributed one minor unit at a time, largest fractional part first
 * (Fowler's allocate). Used for spreading a discount or a partial refund over
 * order lines — naive per-line rounding leaves stray cents that never
 * reconcile against the provider.
 */
export function allocate(value: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) throw new RangeError("allocate requires at least one ratio");
  if (ratios.some((r) => r < 0)) throw new RangeError("allocate ratios must be non-negative");

  const total = ratios.reduce((acc, r) => acc + r, 0);
  if (total === 0) throw new RangeError("allocate ratios must not sum to zero");

  const sign = value.amount < 0 ? -1 : 1;
  const magnitude = Math.abs(value.amount);

  const exact = ratios.map((r) => (magnitude * r) / total);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = magnitude - floors.reduce((acc, v) => acc + v, 0);

  // Hand out the remaining minor units to the largest fractional parts.
  const order = exact
    .map((v, index) => ({ index, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const amounts = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    amounts[index] = (amounts[index] ?? 0) + 1;
    remainder -= 1;
  }

  return amounts.map((amount) => money(amount * sign, value.currency));
}

/** Formats for display. Presentation only — never use the result for maths. */
export function format(value: Money, locale: string): string {
  const minorUnits = CURRENCY_MINOR_UNITS[value.currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
  }).format(value.amount / 10 ** minorUnits);
}
