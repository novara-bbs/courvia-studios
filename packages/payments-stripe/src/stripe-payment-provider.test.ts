/**
 * Verifies the credential-free half of the Stripe adapter against synthetic
 * payloads signed with Stripe's real scheme. The full
 * describePaymentProviderContract suite (which also exercises refunds) gates
 * the credentialed integration task.
 */
import { createHmac } from "node:crypto";

import { NotImplementedError, WebhookSignatureError } from "@courvia/commerce-domain";
import { describe, expect, it } from "vitest";

import { StripePaymentProvider } from "./stripe-payment-provider";

const SECRET = "whsec_test_secret";
const NOW = 1_700_000_000_000;

function sign(rawBody: string, timestamp = Math.floor(NOW / 1000)): string {
  const v1 = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function make(): StripePaymentProvider {
  return new StripePaymentProvider({ webhookSecret: SECRET, now: () => NOW });
}

const PAID_BODY = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  created: Math.floor(NOW / 1000),
  data: {
    object: {
      id: "cs_1",
      payment_intent: "pi_1",
      payment_status: "paid",
      amount_total: 129000,
      currency: "eur",
      metadata: { orderId: "42" },
    },
  },
});

describe("StripePaymentProvider (prepared, not connected)", () => {
  it("verifies a genuine signature and surfaces the event id", async () => {
    const event = await make().verifyWebhook(PAID_BODY, sign(PAID_BODY));
    expect(event.provider).toBe("stripe");
    expect(event.providerEventId).toBe("evt_1");
  });

  it("rejects a tampered body", async () => {
    await expect(make().verifyWebhook(`${PAID_BODY} `, sign(PAID_BODY))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects a stale timestamp (replay window)", async () => {
    const old = Math.floor(NOW / 1000) - 3600;
    await expect(make().verifyWebhook(PAID_BODY, sign(PAID_BODY, old))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects a malformed signature header", async () => {
    await expect(make().verifyWebhook(PAID_BODY, "garbage")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("normalizes checkout.session.completed into paid", async () => {
    const provider = make();
    const raw = await provider.verifyWebhook(PAID_BODY, sign(PAID_BODY));
    const normalized = provider.normalizeEvent(raw);
    expect(normalized).toMatchObject({
      type: "paid",
      orderId: "42",
      providerPaymentId: "pi_1",
      amount: { amount: 129000, currency: "EUR" },
    });
  });

  it("normalizes charge.refunded with partial detection", () => {
    const provider = make();
    const normalized = provider.normalizeEvent({
      provider: "stripe",
      providerEventId: "evt_2",
      payload: {
        id: "evt_2",
        type: "charge.refunded",
        created: Math.floor(NOW / 1000),
        data: {
          object: {
            id: "ch_1",
            payment_intent: "pi_1",
            amount: 129000,
            amount_refunded: 50000,
            currency: "eur",
            metadata: { orderId: "42" },
          },
        },
      },
    });
    expect(normalized).toMatchObject({ type: "refunded", partial: true, amount: { amount: 50000 } });
  });

  it("returns null — never throws — for events without domain meaning", () => {
    const provider = make();
    expect(
      provider.normalizeEvent({
        provider: "stripe",
        providerEventId: "evt_3",
        payload: {
          id: "evt_3",
          type: "customer.created",
          created: Math.floor(NOW / 1000),
          data: { object: { currency: "eur", metadata: { orderId: "42" } } },
        },
      }),
    ).toBeNull();
  });

  it("returns null when metadata.orderId is missing (foreign event)", () => {
    const provider = make();
    expect(
      provider.normalizeEvent({
        provider: "stripe",
        providerEventId: "evt_4",
        payload: {
          id: "evt_4",
          type: "checkout.session.completed",
          created: Math.floor(NOW / 1000),
          data: {
            object: { payment_status: "paid", amount_total: 100, currency: "eur", metadata: {} },
          },
        },
      }),
    ).toBeNull();
  });

  it("createSession and refund reject until the integration is connected", async () => {
    await expect(
      make().createSession({} as never, "es"),
    ).rejects.toBeInstanceOf(NotImplementedError);
    await expect(make().refund("pi_1")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
