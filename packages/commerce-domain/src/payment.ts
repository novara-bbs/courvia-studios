/**
 * Payment port (CLAUDE.md §3.2) — gateways are swappable like themes.
 * The order state machine consumes only normalized PaymentEvents; the
 * domain never knows which gateway sits behind them.
 */
import type { Market, Money, Order, PaymentProviderId } from "./types";

/** Raw, signature-verified webhook event, still provider-shaped. */
export interface ProviderEvent {
  provider: PaymentProviderId;
  /** Provider's own event id — idempotency key together with `provider`
   * ((provider, provider_event_id) UNIQUE, enforced in persistence). */
  providerEventId: string;
  /** Provider-specific payload; only the adapter may look inside. */
  payload: unknown;
}

export type PaymentEventType = "authorized" | "paid" | "failed" | "refunded";

/** Normalized payment event — the only payment input the domain accepts. */
export interface PaymentEvent {
  type: PaymentEventType;
  provider: PaymentProviderId;
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  amount: Money;
  /** Only meaningful for `refunded`: true when the refund is partial. */
  partial?: boolean;
  occurredAt: string; // ISO-8601
}

export interface PaymentSession {
  provider: PaymentProviderId;
  providerPaymentId: string;
  url?: string;
  clientSecret?: string;
}

export interface RefundResult {
  provider: PaymentProviderId;
  providerRefundId: string;
  amount: Money;
  status: "succeeded" | "pending" | "failed";
}

export interface PaymentProvider {
  id: PaymentProviderId;
  createSession(order: Order, market: Market): Promise<PaymentSession>;
  refund(providerPaymentId: string, amount?: Money): Promise<RefundResult>;
  /** Verifies the webhook signature; throws on an invalid signature. */
  verifyWebhook(req: Request): ProviderEvent;
  normalizeEvent(e: ProviderEvent): PaymentEvent;
}
