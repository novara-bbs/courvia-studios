/**
 * Dos capas sobre el mismo adaptador:
 *
 *  1. `describePaymentProviderContract` — la suite común del puerto. Adyen
 *     entra en ella declarándose `signed-payload-fields`: su HMAC cubre ocho
 *     campos ya parseados, no los bytes, y la suite ancla esa fuga en un
 *     test en vez de dejarla en la memoria de alguien.
 *  2. Los casos propios de Adyen: lotes rechazados, REFUND como delta,
 *     REFUND_FAILED.
 *
 * La clave HMAC de abajo es inventada para este fichero (hex de 32 bytes con
 * la forma que emite el Customer Area). Ninguna prueba usa credenciales
 * reales.
 */
import { createHmac } from "node:crypto";

import { NotImplementedError, WebhookSignatureError, money, zero } from "@courvia/commerce-domain";
import type { Order } from "@courvia/commerce-domain";
import { describePaymentProviderContract } from "@courvia/commerce-domain/testing";
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

/** CAPTURE: firmado y legítimo, sin transición que provocar. */
const CAPTURE: Item = {
  ...AUTHORISED,
  eventCode: "CAPTURE",
  pspReference: "9910000000000001",
};

const ORDER: Order = {
  id: "42",
  market: "es",
  currency: "EUR",
  status: "pending_payment",
  lines: [
    { variantId: "var_1", sku: "DRL-PRO-P", quantity: 1, unitAmount: money(129_000, "EUR") },
  ],
  total: money(129_000, "EUR"),
  taxTotal: money(22_388, "EUR"),
  shippingTotal: zero("EUR"),
  refundedTotal: money(0, "EUR"),
};

describePaymentProviderContract("AdyenPaymentProvider", make, {
  // La firma va DENTRO del payload y cubre ocho campos, no los bytes.
  webhookAuth: "signed-payload-fields",
  valid: {
    rawBody: webhookBody(sign(AUTHORISED)),
    // La ruta no encuentra cabecera para Adyen y pasa "": el adaptador
    // verifica contra el cuerpo. Que el contrato lo ejercite así es la
    // prueba de que ese "" no es un descuido.
    signature: "",
    expectedEventId: "8837544667789012:AUTHORISATION",
  },
  ignored: { rawBody: webhookBody(sign(CAPTURE)), signature: "" },
  forgedCredential: {
    rawBody: webhookBody({
      ...AUTHORISED,
      // Misma forma que una firma real (base64 de 32 bytes), otro valor: así
      // el rechazo pasa por la comparación en tiempo constante, no por una
      // diferencia de longitud.
      additionalData: { hmacSignature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    }),
    signature: "",
  },
  // El importe SÍ está entre los ocho campos firmados: tocarlo revienta.
  signedFieldTamper: {
    rawBody: webhookBody({ ...sign(AUTHORISED), amount: { value: 1, currency: "EUR" } }),
    signature: "",
  },
  session: { order: ORDER, market: "es" },
  refund: { providerPaymentId: "8837544667789012", amount: money(50_000, "EUR") },
  // Sin credenciales del Customer Area no hay sesión ni reembolso.
});

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
