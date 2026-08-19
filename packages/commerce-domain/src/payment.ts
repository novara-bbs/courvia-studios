/**
 * Payment port (CLAUDE.md §3.2) — gateways are swappable like themes.
 * The order state machine consumes only normalized PaymentEvents; the
 * domain never knows which gateway sits behind them.
 */
import type { MarketId, PaymentProviderId } from "@courvia/platform";

import type { Money } from "./money";
import type { Order } from "./types";

/** Raw, signature-verified webhook event, still provider-shaped. */
export interface ProviderEvent {
  provider: PaymentProviderId;
  /** Provider's own event id — idempotency key together with `provider`
   * ((provider, provider_event_id) UNIQUE, enforced in persistence). */
  providerEventId: string;
  /** Provider-specific payload; only the adapter may look inside. */
  payload: unknown;
}

export type PaymentEventType = "authorized" | "paid" | "failed" | "refunded" | "refund_failed";

/** Normalized payment event — the only payment input the domain accepts. */
export interface PaymentEvent {
  type: PaymentEventType;
  provider: PaymentProviderId;
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  /** For refunds this is the refunded amount, not the order total. */
  amount: Money;
  /** Only meaningful for `refunded`: true when it does not cover the order. */
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

/** Raised by `verifyWebhook` when a signature does not match. */
export class WebhookSignatureError extends Error {
  constructor(provider: PaymentProviderId, cause?: unknown) {
    super(`Invalid webhook signature for provider "${provider}"`);
    this.name = "WebhookSignatureError";
    this.cause = cause;
  }
}

export interface PaymentProvider {
  id: PaymentProviderId;

  createSession(order: Order, market: MarketId): Promise<PaymentSession>;

  refund(providerPaymentId: string, amount?: Money): Promise<RefundResult>;

  /**
   * Verifies the webhook signature over the EXACT bytes received.
   *
   * Takes the raw body rather than a `Request` and is async on purpose:
   * every gateway signs the unparsed payload, and reading a `Request` body
   * requires awaiting it. An earlier synchronous `(req: Request)` signature
   * was literally unimplementable — caught by the contract suite in
   * `./testing`, which every adapter must pass.
   *
   * Implementations MUST be `async` (or return a rejected promise): a
   * synchronous throw escapes before the promise exists, so callers using
   * `.catch()` never see it. The contract suite asserts this.
   *
   * @throws WebhookSignatureError when the signature does not match.
   */
  verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent>;

  /** Returns null for provider events the domain has no meaning for. */
  normalizeEvent(event: ProviderEvent): PaymentEvent | null;
}
