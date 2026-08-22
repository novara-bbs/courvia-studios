/**
 * Dos capas sobre el mismo adaptador:
 *
 *  1. `describePaymentProviderContract` — la suite común del puerto, la que
 *     convierte "cambiar de pasarela sin tocar el dominio" en algo
 *     verificado. Todo con secretos inventados aquí mismo: ninguna prueba de
 *     este repo necesita una credencial real.
 *  2. Los casos propios de Stripe que la suite no puede conocer: ventana
 *     anti-replay, rotación del secreto de firma, `amount_refunded` como
 *     total acumulado.
 */
import { createHmac } from "node:crypto";

import { NotImplementedError, WebhookSignatureError, money, zero } from "@courvia/commerce-domain";
import type { Order } from "@courvia/commerce-domain";
import { describePaymentProviderContract } from "@courvia/commerce-domain/testing";
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

/** Evento nuestro (lleva metadata.orderId) pero sin significado de dominio. */
const IGNORED_BODY = JSON.stringify({
  id: "evt_ignored",
  type: "customer.created",
  created: Math.floor(NOW / 1000),
  data: { object: { id: "cus_1", currency: "eur", metadata: { orderId: "42" } } },
});

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

describePaymentProviderContract("StripePaymentProvider", make, {
  // Stripe firma `${timestamp}.${rawBody}`: los bytes exactos, sin parsear.
  webhookAuth: "raw-body-signature",
  valid: { rawBody: PAID_BODY, signature: sign(PAID_BODY), expectedEventId: "evt_1" },
  ignored: { rawBody: IGNORED_BODY, signature: sign(IGNORED_BODY) },
  // Cabecera bien formada, v1 que no es: el caso del atacante que conoce el
  // formato y no el secreto. Misma longitud que una firma real, así que el
  // rechazo pasa por la comparación en tiempo constante.
  forgedCredential: {
    rawBody: PAID_BODY,
    signature: `t=${Math.floor(NOW / 1000)},v1=${"0".repeat(64)}`,
  },
  session: { order: ORDER, market: "es" },
  refund: { providerPaymentId: "pi_1", amount: money(50_000, "EUR") },
  // Nada conectado: sin STRIPE_SECRET_KEY no hay sesión ni reembolso, y el
  // adaptador lo dice lanzando (docs/payments-runbook.md).
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

  it("accepts any matching v1 during a signing-secret rotation", async () => {
    // Stripe sends one v1 per active secret; ours is the SECOND one here.
    const t = Math.floor(NOW / 1000);
    const wrong = "0".repeat(64);
    const right = sign(PAID_BODY).split("v1=")[1]!;
    const rotated = `t=${t},v1=${wrong},v1=${right}`;
    const event = await make().verifyWebhook(PAID_BODY, rotated);
    expect(event.providerEventId).toBe("evt_1");
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
    expect(normalized).toMatchObject({
      type: "refunded",
      partial: true,
      cumulative: true,
      amount: { amount: 50000 },
    });
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
