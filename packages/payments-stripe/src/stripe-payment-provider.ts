/**
 * StripePaymentProvider — PREPARED, not yet connected.
 *
 * What is implemented today (no credentials, no SDK, no network):
 *  - verifyWebhook: Stripe's real signature scheme — HMAC-SHA256 of
 *    `${timestamp}.${rawBody}` with the webhook signing secret, parsed from
 *    the `Stripe-Signature` header (`t=...,v1=...`), timing-safe compare and
 *    a replay-tolerance window.
 *  - normalizeEvent: the documented Stripe event types mapped to normalized
 *    PaymentEvents. The order id travels in `metadata.orderId`, set when the
 *    session is created (see payments-runbook.md).
 *
 * What is deliberately NOT implemented (requires credentials + the Stripe
 * SDK + explicit human approval, payments.md):
 *  - createSession / refund — they reject with NotImplementedError until the
 *    integration task lands. The port stays honest: it never pretends.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { NotImplementedError, WebhookSignatureError, money } from "@courvia/commerce-domain";
import type {
  Money,
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
  ProviderEvent,
  RefundResult,
} from "@courvia/commerce-domain";
import type { Currency, MarketId } from "@courvia/platform";
import type { Order } from "@courvia/commerce-domain";

export interface StripePaymentProviderOptions {
  /** whsec_… — the WEBHOOK signing secret, never the API key. */
  webhookSecret: string;
  /** Max age of a signed payload in seconds (replay window). */
  toleranceSeconds?: number;
  /** Injected clock for tests. */
  now?: () => number;
}

const CURRENCIES: Record<string, Currency> = { eur: "EUR", gbp: "GBP", aed: "AED" };

interface StripeEventBody {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;

  constructor(private readonly options: StripePaymentProviderOptions) {}

  createSession(_order: Order, _market: MarketId): Promise<PaymentSession> {
    return Promise.reject(new NotImplementedError("createSession", "stripe-not-connected"));
  }

  refund(_providerPaymentId: string, _amount?: Money): Promise<RefundResult> {
    return Promise.reject(new NotImplementedError("refund", "stripe-not-connected"));
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent> {
    // Header shape: "t=1687982400,v1=abc...,v1=def...,v0=..." — during a
    // signing-secret rotation Stripe sends MULTIPLE v1 signatures (one per
    // active secret); the payload is genuine if ANY of them matches.
    let timestamp: string | undefined;
    const candidates: string[] = [];
    for (const pair of signature.split(",")) {
      const eq = pair.indexOf("=");
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (key === "t") timestamp = value;
      if (key === "v1") candidates.push(value);
    }
    if (timestamp === undefined || candidates.length === 0 || !/^\d+$/.test(timestamp)) {
      throw new WebhookSignatureError(this.id);
    }

    const tolerance = this.options.toleranceSeconds ?? 300;
    const nowSeconds = Math.floor((this.options.now ?? Date.now)() / 1000);
    if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
      throw new WebhookSignatureError(this.id, "timestamp outside tolerance");
    }

    const computed = createHmac("sha256", this.options.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(computed, "utf8");
    const matches = candidates.some((candidate) => {
      const b = Buffer.from(candidate, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!matches) {
      throw new WebhookSignatureError(this.id);
    }

    const body = JSON.parse(rawBody) as StripeEventBody;
    const eventId = str(body.id);
    if (eventId === undefined) throw new WebhookSignatureError(this.id, "missing event id");
    return { provider: this.id, providerEventId: eventId, payload: body };
  }

  normalizeEvent(event: ProviderEvent): PaymentEvent | null {
    const body = event.payload as StripeEventBody;
    const object = body.data?.object ?? {};
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const orderId = str(metadata.orderId);
    const currency = CURRENCIES[str(object.currency)?.toLowerCase() ?? ""];
    const occurredAt = new Date((num(body.created) ?? 0) * 1000).toISOString();
    if (orderId === undefined || currency === undefined) return null;

    switch (body.type) {
      case "checkout.session.completed": {
        if (str(object.payment_status) !== "paid") return null;
        const amount = num(object.amount_total);
        const paymentId = str(object.payment_intent) ?? str(object.id);
        if (amount === undefined || paymentId === undefined) return null;
        return {
          type: "paid",
          provider: this.id,
          providerEventId: event.providerEventId,
          providerPaymentId: paymentId,
          orderId,
          amount: money(amount, currency),
          occurredAt,
        };
      }
      case "payment_intent.payment_failed": {
        const amount = num(object.amount) ?? 0;
        const paymentId = str(object.id);
        if (paymentId === undefined) return null;
        return {
          type: "failed",
          provider: this.id,
          providerEventId: event.providerEventId,
          providerPaymentId: paymentId,
          orderId,
          amount: money(amount, currency),
          occurredAt,
        };
      }
      case "charge.refunded": {
        const refunded = num(object.amount_refunded);
        const total = num(object.amount);
        const paymentId = str(object.payment_intent) ?? str(object.id);
        if (refunded === undefined || total === undefined || paymentId === undefined) return null;
        return {
          type: "refunded",
          provider: this.id,
          providerEventId: event.providerEventId,
          providerPaymentId: paymentId,
          orderId,
          // amount_refunded is a RUNNING TOTAL, not a per-refund delta.
          amount: money(refunded, currency),
          partial: refunded < total,
          cumulative: true,
          occurredAt,
        };
      }
      case "charge.refund.updated": {
        if (str(object.status) !== "failed") return null;
        const amount = num(object.amount) ?? 0;
        const paymentId = str(object.payment_intent) ?? str(object.charge) ?? "unknown";
        return {
          type: "refund_failed",
          provider: this.id,
          providerEventId: event.providerEventId,
          providerPaymentId: paymentId,
          orderId,
          amount: money(amount, currency),
          occurredAt,
        };
      }
      default:
        return null;
    }
  }
}
