/**
 * TabbyPaymentProvider — PREPARED, not yet connected (BNPL for AE, ADR-06:
 * direct API, Tabby does not exist inside Stripe).
 *
 * What is implemented today:
 *  - verifyWebhook: Tabby authenticates webhooks with a merchant-chosen
 *    header value registered alongside the endpoint (a shared secret, not a
 *    body HMAC): the header must equal the registered value, compared in
 *    constant time. We standardize on the `X-Tabby-Signature` header.
 *  - normalizeEvent: Tabby posts the payment object itself (id, status,
 *    amount as a DECIMAL STRING, currency, order.reference_id, refunds[]).
 *    authorized → paid · rejected/expired → failed · refunds → refunded with
 *    the running total (cumulative), since Tabby resends the whole payment.
 *
 * Deliberately NOT implemented (credentials + human approval): createSession
 * (Tabby Checkout session) and refund (capture/refund API).
 */
import { timingSafeEqual } from "node:crypto";

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

export interface TabbyPaymentProviderOptions {
  /** The exact header value registered with the webhook endpoint. */
  webhookSecret: string;
}

const CURRENCIES: Record<string, Currency> = { AED: "AED", EUR: "EUR", GBP: "GBP" };

interface TabbyRefund {
  amount?: string;
}

interface TabbyPaymentBody {
  id?: string;
  status?: string;
  amount?: string;
  currency?: string;
  created_at?: string;
  order?: { reference_id?: string };
  refunds?: TabbyRefund[];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** "1290.00" → 129000. Decimal-string parsing, never floats: money that
 *  passed through IEEE-754 is money you can no longer reconcile. */
export function decimalToMinor(value: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null) return undefined;
  const units = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return units * 100 + cents;
}

export class TabbyPaymentProvider implements PaymentProvider {
  readonly id = "tabby" as const;

  constructor(private readonly options: TabbyPaymentProviderOptions) {}

  createSession(_order: Order, _market: MarketId): Promise<PaymentSession> {
    return Promise.reject(new NotImplementedError("createSession", "tabby-not-connected"));
  }

  refund(_providerPaymentId: string, _amount?: Money): Promise<RefundResult> {
    return Promise.reject(new NotImplementedError("refund", "tabby-not-connected"));
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent> {
    const a = Buffer.from(this.options.webhookSecret, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError(this.id);
    }

    let body: TabbyPaymentBody;
    try {
      body = JSON.parse(rawBody) as TabbyPaymentBody;
    } catch (error) {
      throw new WebhookSignatureError(this.id, error);
    }
    const paymentId = str(body.id);
    const status = str(body.status);
    if (paymentId === undefined || status === undefined) {
      throw new WebhookSignatureError(this.id, "missing payment id/status");
    }

    // Tabby has no event id: it re-posts the payment on every change. The
    // (id, status, refunded-so-far) triple distinguishes each state the
    // webhook can legitimately report, so replays of the SAME state hit the
    // ledger's UNIQUE constraint and absorb, while new states pass.
    const refundedMinor = (body.refunds ?? []).reduce(
      (sum, refund) => sum + (decimalToMinor(refund.amount ?? "0") ?? 0),
      0,
    );
    return {
      provider: this.id,
      providerEventId: `${paymentId}:${status}:${refundedMinor}`,
      payload: body,
    };
  }

  normalizeEvent(event: ProviderEvent): PaymentEvent | null {
    const body = event.payload as TabbyPaymentBody;
    const orderId = str(body.order?.reference_id);
    const currency = CURRENCIES[str(body.currency) ?? ""];
    const paymentId = str(body.id);
    const totalMinor = decimalToMinor(str(body.amount) ?? "");
    if (
      orderId === undefined ||
      currency === undefined ||
      paymentId === undefined ||
      totalMinor === undefined
    ) {
      return null;
    }
    const occurredAt = new Date(str(body.created_at) ?? 0).toISOString();
    const base = {
      provider: this.id,
      providerEventId: event.providerEventId,
      providerPaymentId: paymentId,
      orderId,
      occurredAt,
    } as const;

    const refundedMinor = (body.refunds ?? []).reduce(
      (sum, refund) => sum + (decimalToMinor(refund.amount ?? "0") ?? 0),
      0,
    );
    // Refunds ride along on any status: the running total is authoritative.
    if (refundedMinor > 0) {
      return {
        ...base,
        type: "refunded",
        amount: money(refundedMinor, currency),
        partial: refundedMinor < totalMinor,
        cumulative: true,
      };
    }

    switch (body.status) {
      case "authorized":
        // Authorized = the buyer completed Tabby's flow; capture is the
        // merchant's API call afterwards (the credentialed task).
        return { ...base, type: "paid", amount: money(totalMinor, currency) };
      case "rejected":
      case "expired":
        return { ...base, type: "failed", amount: money(totalMinor, currency) };
      default:
        // created / closed without refunds: no domain meaning here.
        return null;
    }
  }
}
