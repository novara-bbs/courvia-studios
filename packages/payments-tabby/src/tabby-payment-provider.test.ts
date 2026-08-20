import { NotImplementedError, WebhookSignatureError } from "@courvia/commerce-domain";
import { describe, expect, it } from "vitest";

import { TabbyPaymentProvider, decimalToMinor } from "./tabby-payment-provider";

const SECRET = "tabby-webhook-shared-secret";

function make(): TabbyPaymentProvider {
  return new TabbyPaymentProvider({ webhookSecret: SECRET });
}

const AUTHORIZED = JSON.stringify({
  id: "pay_01",
  status: "authorized",
  amount: "5599.00",
  currency: "AED",
  created_at: "2026-08-20T12:00:00Z",
  order: { reference_id: "42" },
});

describe("decimalToMinor", () => {
  it("parses decimal strings without floats", () => {
    expect(decimalToMinor("1290.00")).toBe(129000);
    expect(decimalToMinor("1290.5")).toBe(129050);
    expect(decimalToMinor("1290")).toBe(129000);
    expect(decimalToMinor("0.01")).toBe(1);
    expect(decimalToMinor("12.345")).toBeUndefined();
    expect(decimalToMinor("abc")).toBeUndefined();
  });
});

describe("TabbyPaymentProvider (prepared, not connected)", () => {
  it("accepts the registered header value and derives a state-shaped id", async () => {
    const event = await make().verifyWebhook(AUTHORIZED, SECRET);
    expect(event.provider).toBe("tabby");
    expect(event.providerEventId).toBe("pay_01:authorized:0");
  });

  it("rejects a wrong or empty secret in constant time", async () => {
    await expect(make().verifyWebhook(AUTHORIZED, "wrong")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    await expect(make().verifyWebhook(AUTHORIZED, "")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("normalizes authorized into paid with minor units", async () => {
    const provider = make();
    const event = await provider.verifyWebhook(AUTHORIZED, SECRET);
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "paid",
      orderId: "42",
      providerPaymentId: "pay_01",
      amount: { amount: 559900, currency: "AED" },
    });
  });

  it("normalizes rejected into failed", async () => {
    const provider = make();
    const body = JSON.stringify({
      id: "pay_02",
      status: "rejected",
      amount: "5599.00",
      currency: "AED",
      order: { reference_id: "42" },
    });
    const event = await provider.verifyWebhook(body, SECRET);
    expect(provider.normalizeEvent(event)?.type).toBe("failed");
  });

  it("normalizes refunds as a running total (cumulative)", async () => {
    const provider = make();
    const body = JSON.stringify({
      id: "pay_01",
      status: "closed",
      amount: "5599.00",
      currency: "AED",
      order: { reference_id: "42" },
      refunds: [{ amount: "1000.00" }, { amount: "500.00" }],
    });
    const event = await provider.verifyWebhook(body, SECRET);
    expect(event.providerEventId).toBe("pay_01:closed:150000");
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "refunded",
      cumulative: true,
      partial: true,
      amount: { amount: 150000 },
    });
  });

  it("returns null for states without domain meaning", async () => {
    const provider = make();
    const body = JSON.stringify({
      id: "pay_03",
      status: "created",
      amount: "5599.00",
      currency: "AED",
      order: { reference_id: "42" },
    });
    const event = await provider.verifyWebhook(body, SECRET);
    expect(provider.normalizeEvent(event)).toBeNull();
  });

  it("createSession and refund reject until the integration is connected", async () => {
    await expect(make().createSession({} as never, "ae")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(make().refund("pay_01")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
