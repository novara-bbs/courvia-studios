/**
 * TamaraPaymentProvider — PREPARED, not yet connected (BNPL for AE, ADR-06:
 * direct API, Tamara does not exist inside Stripe).
 *
 * What is implemented today:
 *  - verifyWebhook: Tamara authenticates notifications with a JWT signed
 *    HS256 using the merchant's Notification Token, delivered as
 *    `Authorization: Bearer <jwt>` (and as the tamaraToken query param).
 *    Verified here with plain node:crypto — header alg is pinned to HS256
 *    (an attacker-controlled `alg` is the classic JWT downgrade), signature
 *    compared timing-safe over the exact signing input.
 *  - normalizeEvent: order_authorised → paid · order_declined/order_expired/
 *    order_canceled → failed · order_refunded → refunded (per-refund delta).
 *    The order id travels in order_reference_id (our id, set at session
 *    creation); amounts arrive as {amount, currency} objects.
 *
 * Deliberately NOT implemented (credentials + human approval): createSession
 * (Tamara checkout session) and refund.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { NotImplementedError, WebhookSignatureError, money } from "@courvia/commerce-domain";
import type {
  Money,
  Order,
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
  ProviderEvent,
  RefundResult,
} from "@courvia/commerce-domain";
import type { Currency, MarketId } from "@courvia/platform";

export interface TamaraPaymentProviderOptions {
  /** Tamara's Notification Token (JWT HS256 secret) — never the API token. */
  notificationToken: string;
}

const CURRENCIES: Record<string, Currency> = { AED: "AED", EUR: "EUR", GBP: "GBP" };

interface TamaraAmount {
  amount?: number | string;
  currency?: string;
}

interface TamaraWebhookBody {
  order_id?: string;
  order_reference_id?: string;
  event_type?: string;
  created_at?: string;
  data?: {
    total_amount?: TamaraAmount;
    captured_amount?: TamaraAmount;
    refunded_amount?: TamaraAmount;
    refund_id?: string;
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function base64UrlDecode(segment: string): string {
  return Buffer.from(segment, "base64url").toString("utf8");
}

/** {amount: 5599 | "5599.00"} → minor units, decimal-string safe. */
function toMinor(value: TamaraAmount | undefined): number | undefined {
  const raw = value?.amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100);
  if (typeof raw !== "string") return undefined;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (match === null) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export class TamaraPaymentProvider implements PaymentProvider {
  readonly id = "tamara" as const;

  constructor(private readonly options: TamaraPaymentProviderOptions) {}

  createSession(_order: Order, _market: MarketId): Promise<PaymentSession> {
    return Promise.reject(new NotImplementedError("createSession", "tamara-not-connected"));
  }

  refund(_providerPaymentId: string, _amount?: Money): Promise<RefundResult> {
    return Promise.reject(new NotImplementedError("refund", "tamara-not-connected"));
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent> {
    const jwt = signature.startsWith("Bearer ") ? signature.slice(7).trim() : signature.trim();
    const parts = jwt.split(".");
    if (parts.length !== 3) throw new WebhookSignatureError(this.id, "malformed JWT");
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    let header: { alg?: string };
    try {
      header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string };
    } catch (error) {
      throw new WebhookSignatureError(this.id, error);
    }
    // Pin the algorithm: accepting the header's word for it is how "none"
    // and RS256→HS256 downgrades happen.
    if (header.alg !== "HS256") throw new WebhookSignatureError(this.id, "alg must be HS256");

    const expected = createHmac("sha256", this.options.notificationToken)
      .update(`${headerB64}.${payloadB64}`, "utf8")
      .digest("base64url");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureB64, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError(this.id);
    }

    let body: TamaraWebhookBody;
    try {
      body = JSON.parse(rawBody) as TamaraWebhookBody;
    } catch (error) {
      throw new WebhookSignatureError(this.id, error);
    }
    const orderId = str(body.order_id);
    const eventType = str(body.event_type);
    if (orderId === undefined || eventType === undefined) {
      throw new WebhookSignatureError(this.id, "missing order_id/event_type");
    }

    // Tamara has no notification id: (order, event type) identifies each
    // lifecycle step; refunds append their own id so a second refund is a
    // new event while a replay of the first absorbs at the ledger.
    const refundSuffix = str(body.data?.refund_id);
    const providerEventId =
      refundSuffix === undefined ? `${orderId}:${eventType}` : `${orderId}:${eventType}:${refundSuffix}`;
    return { provider: this.id, providerEventId, payload: body };
  }

  normalizeEvent(event: ProviderEvent): PaymentEvent | null {
    const body = event.payload as TamaraWebhookBody;
    const orderId = str(body.order_reference_id);
    const paymentId = str(body.order_id);
    if (orderId === undefined || paymentId === undefined) return null;
    const occurredAt = new Date(str(body.created_at) ?? 0).toISOString();

    const base = {
      provider: this.id,
      providerEventId: event.providerEventId,
      providerPaymentId: paymentId,
      orderId,
      occurredAt,
    } as const;

    const resolve = (value: TamaraAmount | undefined): Money | null => {
      const minor = toMinor(value);
      const currency = CURRENCIES[str(value?.currency) ?? ""];
      return minor === undefined || currency === undefined ? null : money(minor, currency);
    };

    switch (body.event_type) {
      case "order_authorised": {
        // Approved is the shopper finishing Tamara's flow; authorised is the
        // money actually reserved for us — that is our `paid`.
        const amount = resolve(body.data?.total_amount);
        return amount === null ? null : { ...base, type: "paid", amount };
      }
      case "order_declined":
      case "order_expired":
      case "order_canceled": {
        const amount = resolve(body.data?.total_amount);
        return amount === null ? null : { ...base, type: "failed", amount };
      }
      case "order_refunded": {
        // Each refund arrives as its own delta.
        const amount = resolve(body.data?.refunded_amount);
        return amount === null
          ? null
          : { ...base, type: "refunded", amount, partial: true, cumulative: false };
      }
      default:
        // order_approved (pre-authorise), order_captured, disputes: no
        // domain transition here.
        return null;
    }
  }
}
