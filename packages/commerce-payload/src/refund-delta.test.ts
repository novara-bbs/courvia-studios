/**
 * The full applier (transactions, locks, ledger) is covered by the
 * integration suite in apps/web/src/server/commerce-adapter.test.ts against
 * real Postgres; this covers the pure arithmetic every path relies on.
 */
import { describe, expect, it } from "vitest";

import { resolveRefundTotal } from "./refund-delta";

const ORDER = { refundedAmount: 0, totalAmount: 129000 };

describe("resolveRefundTotal", () => {
  it("accumulates incremental refunds", () => {
    const first = resolveRefundTotal(ORDER, { amountMinor: 50000, cumulative: false });
    expect(first).toEqual({ refundedAfter: 50000, delta: 50000, partial: true });

    const second = resolveRefundTotal(
      { ...ORDER, refundedAmount: first.refundedAfter },
      { amountMinor: 79000, cumulative: false },
    );
    expect(second).toEqual({ refundedAfter: 129000, delta: 79000, partial: false });
  });

  it("treats a cumulative amount as the running total, not an increment", () => {
    const partial = resolveRefundTotal(ORDER, { amountMinor: 50000, cumulative: true });
    expect(partial).toEqual({ refundedAfter: 50000, delta: 50000, partial: true });

    const remainder = resolveRefundTotal(
      { ...ORDER, refundedAmount: 50000 },
      { amountMinor: 129000, cumulative: true },
    );
    expect(remainder).toEqual({ refundedAfter: 129000, delta: 79000, partial: false });
  });

  it("absorbs a cumulative replay to a zero delta", () => {
    const replay = resolveRefundTotal(
      { ...ORDER, refundedAmount: 50000 },
      { amountMinor: 50000, cumulative: true },
    );
    expect(replay.delta).toBe(0);
  });

  it("clamps an overshooting refund to the order total", () => {
    const overshoot = resolveRefundTotal(ORDER, { amountMinor: 999999, cumulative: true });
    expect(overshoot).toEqual({ refundedAfter: 129000, delta: 129000, partial: false });

    const incrementalOvershoot = resolveRefundTotal(
      { ...ORDER, refundedAmount: 100000 },
      { amountMinor: 50000, cumulative: false },
    );
    expect(incrementalOvershoot).toEqual({ refundedAfter: 129000, delta: 29000, partial: false });
  });
});
