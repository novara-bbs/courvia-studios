/**
 * Pure half of the refund applier: providers report refunds either as a
 * running total (Stripe's `amount_refunded`, event.cumulative) or as an
 * increment. Everything downstream — replay absorption, the partial flag,
 * the amount persisted on the order — derives from one resolved total.
 */
export interface RefundResolution {
  /** Total refunded after this event, clamped to the order total. */
  refundedAfter: number;
  /** What this event actually adds; 0 or negative = replay, apply nothing. */
  delta: number;
  /** True while something remains unrefunded — feeds trigger.partial. */
  partial: boolean;
}

export function resolveRefundTotal(
  order: { refundedAmount: number; totalAmount: number },
  event: { amountMinor: number; cumulative: boolean },
): RefundResolution {
  const raw = event.cumulative ? event.amountMinor : order.refundedAmount + event.amountMinor;
  const refundedAfter = Math.min(raw, order.totalAmount);
  return {
    refundedAfter,
    delta: refundedAfter - order.refundedAmount,
    partial: refundedAfter < order.totalAmount,
  };
}
