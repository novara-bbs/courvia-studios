/**
 * Dos capas sobre el mismo adaptador:
 *
 *  1. `describePaymentProviderContract` — la suite común del puerto. Tamara
 *     entra declarándose `shared-secret`: el JWT se firma sobre su propia
 *     cabecera y payload, nunca sobre el cuerpo de la notificación, así que
 *     la suite fija esa fuga en un test (docs/payments-runbook.md).
 *  2. Los casos propios de Tamara: downgrade de algoritmo, prefijo Bearer,
 *     reembolso con id propio.
 *
 * El token de abajo es inventado para este fichero.
 */
import { createHmac } from "node:crypto";

import { NotImplementedError, WebhookSignatureError, money } from "@courvia/commerce-domain";
import type { Order } from "@courvia/commerce-domain";
import { describePaymentProviderContract } from "@courvia/commerce-domain/testing";
import { describe, expect, it } from "vitest";

import { TamaraPaymentProvider } from "./tamara-payment-provider";

const TOKEN = "tamara-notification-token";

function jwt(secret = TOKEN, alg = "HS256"): string {
  const header = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "Tamara" })).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`, "utf8")
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const AUTHORISED = JSON.stringify({
  order_id: "tmr_01",
  order_reference_id: "42",
  event_type: "order_authorised",
  created_at: "2026-08-20T12:00:00Z",
  data: { total_amount: { amount: "5599.00", currency: "AED" } },
});

function make(): TamaraPaymentProvider {
  return new TamaraPaymentProvider({ notificationToken: TOKEN });
}

/** Aprobado: el comprador terminó el flujo, el dinero aún no está reservado. */
const APPROVED = JSON.stringify({
  order_id: "tmr_01",
  order_reference_id: "42",
  event_type: "order_approved",
  created_at: "2026-08-20T12:00:00Z",
  data: { total_amount: { amount: "5599.00", currency: "AED" } },
});

const ORDER: Order = {
  id: "42",
  market: "ae",
  currency: "AED",
  status: "pending_payment",
  lines: [
    { variantId: "var_1", sku: "DRL-PRO-P", quantity: 1, unitAmount: money(559_900, "AED") },
  ],
  total: money(559_900, "AED"),
  taxTotal: money(26_662, "AED"),
  refundedTotal: money(0, "AED"),
};

describePaymentProviderContract("TamaraPaymentProvider", make, {
  // JWT HS256 en Authorization: firma su propia cabecera y payload, no el
  // cuerpo de la notificación.
  webhookAuth: "shared-secret",
  valid: {
    rawBody: AUTHORISED,
    signature: `Bearer ${jwt()}`,
    expectedEventId: "tmr_01:order_authorised",
  },
  ignored: { rawBody: APPROVED, signature: `Bearer ${jwt()}` },
  forgedCredential: { rawBody: AUTHORISED, signature: `Bearer ${jwt("otro-token")}` },
  session: { order: ORDER, market: "ae" },
  refund: { providerPaymentId: "tmr_01", amount: money(100_000, "AED") },
  // Sin credenciales de Tamara no hay sesión de checkout ni reembolso.
});

describe("TamaraPaymentProvider (prepared, not connected)", () => {
  it("verifies a genuine HS256 token (with or without the Bearer prefix)", async () => {
    const bare = await make().verifyWebhook(AUTHORISED, jwt());
    expect(bare.providerEventId).toBe("tmr_01:order_authorised");
    const bearer = await make().verifyWebhook(AUTHORISED, `Bearer ${jwt()}`);
    expect(bearer.provider).toBe("tamara");
  });

  it("rejects a token signed with another secret", async () => {
    await expect(make().verifyWebhook(AUTHORISED, jwt("otro"))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects an algorithm downgrade, even correctly signed", async () => {
    await expect(make().verifyWebhook(AUTHORISED, jwt(TOKEN, "none"))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("rejects a malformed token", async () => {
    await expect(make().verifyWebhook(AUTHORISED, "garbage")).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("normalizes order_authorised into paid with minor units", async () => {
    const provider = make();
    const event = await provider.verifyWebhook(AUTHORISED, jwt());
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "paid",
      orderId: "42",
      providerPaymentId: "tmr_01",
      amount: { amount: 559900, currency: "AED" },
    });
  });

  it("normalizes order_expired into failed", async () => {
    const provider = make();
    const body = JSON.stringify({
      order_id: "tmr_02",
      order_reference_id: "42",
      event_type: "order_expired",
      data: { total_amount: { amount: 5599, currency: "AED" } },
    });
    const event = await provider.verifyWebhook(body, jwt());
    expect(provider.normalizeEvent(event)?.type).toBe("failed");
  });

  it("normalizes order_refunded as a per-refund delta with its own event id", async () => {
    const provider = make();
    const body = JSON.stringify({
      order_id: "tmr_01",
      order_reference_id: "42",
      event_type: "order_refunded",
      data: { refunded_amount: { amount: "1000.00", currency: "AED" }, refund_id: "rf_9" },
    });
    const event = await provider.verifyWebhook(body, jwt());
    expect(event.providerEventId).toBe("tmr_01:order_refunded:rf_9");
    expect(provider.normalizeEvent(event)).toMatchObject({
      type: "refunded",
      cumulative: false,
      amount: { amount: 100000 },
    });
  });

  it("returns null for lifecycle steps without domain meaning", async () => {
    const provider = make();
    const body = JSON.stringify({
      order_id: "tmr_01",
      order_reference_id: "42",
      event_type: "order_approved",
      data: { total_amount: { amount: "5599.00", currency: "AED" } },
    });
    const event = await provider.verifyWebhook(body, jwt());
    expect(provider.normalizeEvent(event)).toBeNull();
  });

  it("createSession and refund reject until the integration is connected", async () => {
    await expect(make().createSession({} as never, "ae")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(make().refund("tmr_01")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
