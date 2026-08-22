/**
 * Dos capas sobre el mismo adaptador:
 *
 *  1. `describePaymentProviderContract` — la suite común del puerto. Tabby
 *     entra declarándose `shared-secret`: su credencial autentica al emisor
 *     y no toca el cuerpo, así que la suite fija esa fuga en un test
 *     (docs/payments-runbook.md) en lugar de fingir una integridad que la
 *     pasarela no da.
 *  2. Los casos propios de Tabby: importes en cadena decimal, reembolsos
 *     como total acumulado, id de evento derivado del estado.
 *
 * El secreto de abajo es inventado para este fichero.
 */
import { NotImplementedError, WebhookSignatureError, money, zero } from "@courvia/commerce-domain";
import type { Order } from "@courvia/commerce-domain";
import { describePaymentProviderContract } from "@courvia/commerce-domain/testing";
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

/** Pago creado: entrega legítima, todavía sin nada que decidir. */
const CREATED = JSON.stringify({
  id: "pay_03",
  status: "created",
  amount: "5599.00",
  currency: "AED",
  created_at: "2026-08-20T12:00:00Z",
  order: { reference_id: "42" },
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
  shippingTotal: zero("AED"),
  refundedTotal: money(0, "AED"),
};

describePaymentProviderContract("TabbyPaymentProvider", make, {
  // Valor de cabecera registrado con el endpoint: autentica al emisor.
  webhookAuth: "shared-secret",
  valid: { rawBody: AUTHORIZED, signature: SECRET, expectedEventId: "pay_01:authorized:0" },
  ignored: { rawBody: CREATED, signature: SECRET },
  // Misma longitud que el valor registrado, distinto contenido: el rechazo
  // pasa por la comparación en tiempo constante.
  forgedCredential: { rawBody: AUTHORIZED, signature: "tabby-webhook-shared-SECRET" },
  session: { order: ORDER, market: "ae" },
  refund: { providerPaymentId: "pay_01", amount: money(100_000, "AED") },
  // Sin credenciales de Tabby no hay sesión de checkout ni reembolso.
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
