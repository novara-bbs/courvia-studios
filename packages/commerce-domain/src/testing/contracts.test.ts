/**
 * Runs the port contract suites against the in-memory fakes.
 *
 * The point is not to test the fakes: it is to prove the PORTS can be
 * implemented at all. The previous `verifyWebhook(req: Request):
 * ProviderEvent` signature was synchronous and therefore impossible to
 * satisfy with any real gateway — nothing caught it because no
 * implementation existed.
 */
import {
  describeCommerceServiceContract,
  describePaymentProviderContract,
} from "./contracts";
import { money, zero } from "../money";
import { FakeCommerceService, makeFakeCatalog } from "../fakes/fake-commerce-service";
import { FakePaymentProvider, signFakePayload } from "../fakes/fake-payment-provider";
import type { FakeProviderPayload } from "../fakes/fake-payment-provider";
import type { Order } from "../types";

const SECRET = "whsec_test";

function body(payload: FakeProviderPayload): string {
  return JSON.stringify(payload);
}

const paidBody = body({
  id: "evt_paid_1",
  kind: "paid",
  orderId: "order_1",
  paymentId: "pi_1",
  amountMinor: 129_000,
  currency: "EUR",
  occurredAt: "2026-08-19T10:00:00.000Z",
});

const pingBody = body({
  id: "evt_ping_1",
  kind: "unknown_event",
  orderId: "order_1",
  paymentId: "pi_1",
  amountMinor: 0,
  currency: "EUR",
  occurredAt: "2026-08-19T10:00:00.000Z",
});

/** Pedido mínimo pero completo: el fake sí abre sesión, así que el fixture
 *  tiene que ser un pedido de verdad, no un `{} as never`. */
const ORDER: Order = {
  id: "order_1",
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

describePaymentProviderContract(
  "FakePaymentProvider",
  () => new FakePaymentProvider({ secret: SECRET }),
  {
    // El fake existe para demostrar que el puerto es implementable con
    // mecánica real: HMAC sobre los bytes exactos, como hace Stripe.
    webhookAuth: "raw-body-signature",
    valid: {
      rawBody: paidBody,
      signature: signFakePayload(SECRET, paidBody),
      expectedEventId: "evt_paid_1",
    },
    ignored: { rawBody: pingBody, signature: signFakePayload(SECRET, pingBody) },
    forgedCredential: { rawBody: paidBody, signature: signFakePayload("otro-secreto", paidBody) },
    session: { order: ORDER, market: "es" },
    refund: { providerPaymentId: "pi_1", amount: money(50_000, "EUR") },
    // El fake es el ÚNICO proveedor conectado de punta a punta hoy.
    connected: { createSession: true, refund: true },
  },
);

describeCommerceServiceContract(
  "FakeCommerceService",
  () => new FakeCommerceService(makeFakeCatalog()),
  {
    knownSlug: "tempo-r1",
    unknownSlug: "does-not-exist",
    knownSku: "DRL-PRO-P",
    unknownSku: "NOPE-1",
    market: "es",
    otherMarket: "uk",
    checkout: {
      market: "es",
      lines: [{ sku: "DRL-PRO-P", quantity: 1 }],
      email: "cliente@example.test",
      shippingAddress: {
        name: "Cliente",
        line1: "Calle Falsa 123",
        city: "Madrid",
        postalCode: "28001",
        country: "ES",
      },
      provider: "stripe",
    },
  },
);
