/**
 * Verifies the credential-free half of the Adyen adapter with payloads
 * signed exactly as the official adyen-node-api-library hmacValidator does:
 * HMAC-SHA256 over eight ":"-joined NotificationRequestItem fields, hex key,
 * base64 digest, signature inside additionalData.
 */
import { createHmac } from "node:crypto";

import { NotImplementedError, WebhookSignatureError } from "@courvia/commerce-domain";
import { describe, expect, it } from "vitest";

import { AdyenPaymentProvider } from "./adyen-payment-provider";

const HMAC_KEY = "44782def3d570b24b455566bbc6323ef60c0a04c9c7bde14ce1288bd7e4dcd23";

interface Item {
  additionalData?: Record<string, string>;
  amount: { value: number; currency: string };
  eventCode: string;
  eventDate: string;
  merchantAccountCode: string;
  merchantReference: string;
  originalReference?: string;
  pspReference: string;
  success: string;
}

function sign(item: Item): Item {
  const data = [
    item.pspReference,
    item.originalReference ?? "",
    item.merchantAccountCode,
    item.merchantReference,
    String(item.amount.value),
    item.amount.currency,
    item.eventCode,
    item.success,
  ].join(":");
  const hmacSignature = createHmac("sha256", Buffer.from(HMAC_KEY, "hex"))
    .update(data, "utf8")
    .digest("base64");
  return { ...item, additionalData: { ...item.additionalData, hmacSignature } };
}

function webhookBody(item: Item): string {
  return JSON.stringify({ live: "false", notificationItems: [{ NotificationRequestItem: item }] });
}

const AUTHORISED: Item = {
  amount: { value: 129000, currency: "EUR" },
  eventCode: "AUTHORISATION",
  eventDate: "2026-08-20T12:00:00+02:00",
  merchantAccountCode: "CourviaES",
  merchantReference: "42",
  pspReference: "8837544667789012",
  success: "true",
};

function make(): AdyenPaymentProvider {
  return new AdyenPaymentProvider({ hmacKey: HMAC_KEY });
}

describe("AdyenPaymentProvider (prepared, not connected)", () => {
  it("verifies a genuine payload and derives a composite event id", async () => {
    const event = await make().verifyWebhook(webhookBody(sign(AUTHORISED)), "");
    expect(event.provider).toBe("adyen");
    expect(event.providerEventId).toBe("8837544667789012:AUTHORISATION");
  });

  it("rejects a tampered amount (signature no longer matches)", async () => {
    const signed = sign(AUTHORISED);
    const tampered = { ...signed, amount: { value: 1, currency: "EUR" } };
    await expect(make().verifyWebhook(webhookBody(tampered), "")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects a payload without hmacSignature", async () => {
    await expect(make().verifyWebhook(webhookBody(AUTHORISED), "")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects batched payloads (one item per webhook is the contract)", async () => {
    const item = sign(AUTHORISED);
    const batch = JSON.stringify({
      notificationItems: [{ NotificationRequestItem: item }, { NotificationRequestItem: item }],
    });
    await expect(make().verifyWebhook(batch, "")).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("normalizes a successful AUTHORISATION into paid", async () => {
    const provider = make();
    const event = await provider.verifyWebhook(webhookBody(sign(AUTHORISED)), "");
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "paid",
      orderId: "42",
      providerPaymentId: "8837544667789012",
      amount: { amount: 129000, currency: "EUR" },
    });
  });

  it("normalizes a failed AUTHORISATION into failed", async () => {
    const provider = make();
    const event = await provider.verifyWebhook(
      webhookBody(sign({ ...AUTHORISED, success: "false" })),
      "",
    );
    expect(provider.normalizeEvent(event)?.type).toBe("failed");
  });

  it("normalizes REFUND as a per-refund delta (never cumulative)", async () => {
    const provider = make();
    const refund = sign({
      ...AUTHORISED,
      eventCode: "REFUND",
      pspReference: "9915555555550001",
      originalReference: "8837544667789012",
      amount: { value: 50000, currency: "EUR" },
    });
    const event = await provider.verifyWebhook(webhookBody(refund), "");
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "refunded",
      cumulative: false,
      providerPaymentId: "8837544667789012",
      amount: { amount: 50000 },
    });
  });

  it("normalizes a failed REFUND into refund_failed", async () => {
    const provider = make();
    const refund = sign({
      ...AUTHORISED,
      eventCode: "REFUND",
      pspReference: "9915555555550002",
      originalReference: "8837544667789012",
      success: "false",
      amount: { value: 50000, currency: "EUR" },
    });
    const event = await provider.verifyWebhook(webhookBody(refund), "");
    expect(provider.normalizeEvent(event)?.type).toBe("refund_failed");
  });

  it("returns null for event codes without domain meaning", async () => {
    const provider = make();
    const capture = sign({ ...AUTHORISED, eventCode: "CAPTURE", pspReference: "991000000000000" });
    const event = await provider.verifyWebhook(webhookBody(capture), "");
    expect(provider.normalizeEvent(event)).toBeNull();
  });

  it("createSession and refund reject until the integration is connected", async () => {
    await expect(make().createSession({} as never, "es")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(make().refund("psp_1")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
