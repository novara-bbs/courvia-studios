/**
 * AdyenPaymentProvider — PREPARED, not yet connected.
 *
 * What is implemented today (no credentials, no SDK, no network):
 *  - verifyWebhook: Adyen's real standard-webhook HMAC scheme, mirrored from
 *    the official adyen-node-api-library hmacValidator: HMAC-SHA256 over
 *    eight NotificationRequestItem fields joined with ":", key decoded from
 *    hex, digest base64, timing-safe compare against
 *    additionalData.hmacSignature (the signature travels IN the payload for
 *    payment webhooks, not in a header).
 *  - normalizeEvent: AUTHORISATION / REFUND / REFUND_FAILED / CANCELLATION
 *    mapped to normalized PaymentEvents. The order id travels in
 *    merchantReference, set when the session is created.
 *
 * What is deliberately NOT implemented (requires credentials + explicit
 * human approval, payments.md):
 *  - createSession / refund — they reject with NotImplementedError until the
 *    credentialed integration task lands. The port never pretends.
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

export interface AdyenPaymentProviderOptions {
  /** The webhook HMAC key from the Adyen Customer Area, hex-encoded. */
  hmacKey: string;
}

const CURRENCIES: Record<string, Currency> = { EUR: "EUR", GBP: "GBP", AED: "AED" };

interface NotificationRequestItem {
  additionalData?: { hmacSignature?: string };
  amount?: { value?: number; currency?: string };
  eventCode?: string;
  eventDate?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  originalReference?: string;
  pspReference?: string;
  success?: string;
}

interface AdyenWebhookBody {
  live?: string;
  notificationItems?: Array<{ NotificationRequestItem?: NotificationRequestItem }>;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export class AdyenPaymentProvider implements PaymentProvider {
  readonly id = "adyen" as const;

  constructor(private readonly options: AdyenPaymentProviderOptions) {}

  createSession(_order: Order, _market: MarketId): Promise<PaymentSession> {
    return Promise.reject(new NotImplementedError("createSession", "adyen-not-connected"));
  }

  refund(_providerPaymentId: string, _amount?: Money): Promise<RefundResult> {
    return Promise.reject(new NotImplementedError("refund", "adyen-not-connected"));
  }

  /** The exact signing string of the official SDK: eight fields, ":"-joined,
   *  empty string for anything missing. */
  private dataToSign(item: NotificationRequestItem): string {
    return [
      item.pspReference ?? "",
      item.originalReference ?? "",
      item.merchantAccountCode ?? "",
      item.merchantReference ?? "",
      item.amount?.value === undefined ? "" : String(item.amount.value),
      item.amount?.currency ?? "",
      item.eventCode ?? "",
      item.success ?? "",
    ].join(":");
  }

  async verifyWebhook(rawBody: string, _signature: string): Promise<ProviderEvent> {
    let body: AdyenWebhookBody;
    try {
      body = JSON.parse(rawBody) as AdyenWebhookBody;
    } catch (error) {
      throw new WebhookSignatureError(this.id, error);
    }

    // Adyen batches items, but recommends (and defaults to) one per webhook.
    // Accepting only single-item payloads keeps "one delivery = one ledger
    // row" true; configure the webhook accordingly in the Customer Area.
    const items = body.notificationItems ?? [];
    if (items.length !== 1) {
      throw new WebhookSignatureError(this.id, `expected 1 notification item, got ${items.length}`);
    }
    const item = items[0]?.NotificationRequestItem;
    const received = item?.additionalData?.hmacSignature;
    if (item === undefined || received === undefined || received === "") {
      throw new WebhookSignatureError(this.id, "missing hmacSignature");
    }

    const computed = createHmac("sha256", Buffer.from(this.options.hmacKey, "hex"))
      .update(this.dataToSign(item), "utf8")
      .digest("base64");
    const a = Buffer.from(computed, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError(this.id);
    }

    const pspReference = str(item.pspReference);
    const eventCode = str(item.eventCode);
    if (pspReference === undefined || eventCode === undefined) {
      throw new WebhookSignatureError(this.id, "missing pspReference/eventCode");
    }
    // pspReference alone repeats across event codes of one payment; the pair
    // is what Adyen documents as unique per notification.
    return { provider: this.id, providerEventId: `${pspReference}:${eventCode}`, payload: item };
  }

  normalizeEvent(event: ProviderEvent): PaymentEvent | null {
    const item = event.payload as NotificationRequestItem;
    const orderId = str(item.merchantReference);
    const currency = CURRENCIES[str(item.amount?.currency) ?? ""];
    const amountMinor = typeof item.amount?.value === "number" ? item.amount.value : undefined;
    if (orderId === undefined || currency === undefined || amountMinor === undefined) return null;

    const occurredAt = new Date(str(item.eventDate) ?? 0).toISOString();
    const success = item.success === "true";
    // For follow-up events (REFUND…) originalReference points at the
    // payment; for AUTHORISATION the pspReference IS the payment.
    const paymentId = str(item.originalReference) ?? str(item.pspReference) ?? "unknown";

    const base = {
      provider: this.id,
      providerEventId: event.providerEventId,
      providerPaymentId: paymentId,
      orderId,
      amount: money(amountMinor, currency),
      occurredAt,
    } as const;

    switch (item.eventCode) {
      case "AUTHORISATION":
        return { ...base, type: success ? "paid" : "failed" };
      case "REFUND":
        // Adyen reports each refund as its own delta (never a running
        // total); a failed REFUND is a refusal, not silence.
        return success
          ? { ...base, type: "refunded", partial: true, cumulative: false }
          : { ...base, type: "refund_failed" };
      case "REFUND_FAILED":
      case "REFUNDED_REVERSED":
        return { ...base, type: "refund_failed" };
      case "CANCELLATION":
        // Authorization voided before capture: the order can release stock.
        return success ? { ...base, type: "failed" } : null;
      default:
        // CAPTURE, REPORT_AVAILABLE, etc. carry no domain meaning here.
        return null;
    }
  }
}
