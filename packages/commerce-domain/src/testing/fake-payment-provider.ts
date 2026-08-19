/**
 * In-memory PaymentProvider used by the contract suite, Storybook and E2E.
 *
 * Its only job is to prove the port is implementable with real-world
 * mechanics: an HMAC over the raw body (exactly what Stripe, Tabby and
 * Tamara all do) and normalization that returns null for events the domain
 * has no meaning for.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { money } from "../money";
import { WebhookSignatureError } from "../payment";
import type {
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
  ProviderEvent,
  RefundResult,
} from "../payment";
import type { Money } from "../money";
import type { Order } from "../types";

export interface FakeProviderPayload {
  id: string;
  kind: "authorized" | "paid" | "failed" | "refunded" | "refund_failed" | "unknown_event";
  orderId: string;
  paymentId: string;
  amountMinor: number;
  currency: "EUR" | "GBP" | "AED";
  partial?: boolean;
  occurredAt: string;
}

export interface FakePaymentProviderOptions {
  secret: string;
  /** Forces refunds to come back failed, to exercise the failure path. */
  refundOutcome?: RefundResult["status"];
}

export function signFakePayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export class FakePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly refunds: Array<{ providerPaymentId: string; amount?: Money }> = [];

  constructor(private readonly options: FakePaymentProviderOptions) {}

  createSession(order: Order): Promise<PaymentSession> {
    return Promise.resolve({
      provider: this.id,
      providerPaymentId: `pi_${order.id}`,
      url: `https://pay.example.test/${order.id}`,
    });
  }

  refund(providerPaymentId: string, amount?: Money): Promise<RefundResult> {
    this.refunds.push({ providerPaymentId, amount });
    return Promise.resolve({
      provider: this.id,
      providerRefundId: `re_${this.refunds.length}`,
      amount: amount ?? money(0, "EUR"),
      status: this.options.refundOutcome ?? "succeeded",
    });
  }

  // `async` matters: a synchronous throw would escape before the promise
  // exists, so callers using `.catch()` / `.rejects` would never see it.
  async verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent> {
    const expected = signFakePayload(this.options.secret, rawBody);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError(this.id);
    }
    const payload = JSON.parse(rawBody) as FakeProviderPayload;
    return { provider: this.id, providerEventId: payload.id, payload };
  }

  normalizeEvent(event: ProviderEvent): PaymentEvent | null {
    const payload = event.payload as FakeProviderPayload;
    if (payload.kind === "unknown_event") return null;
    return {
      type: payload.kind,
      provider: event.provider,
      providerEventId: event.providerEventId,
      providerPaymentId: payload.paymentId,
      orderId: payload.orderId,
      amount: money(payload.amountMinor, payload.currency),
      ...(payload.partial === undefined ? {} : { partial: payload.partial }),
      occurredAt: payload.occurredAt,
    };
  }
}
