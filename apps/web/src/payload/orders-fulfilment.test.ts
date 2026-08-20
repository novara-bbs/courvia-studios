/**
 * Fulfilment through the real route, against a real Postgres.
 *
 * Nothing is mocked and nothing writes a status by hand: an order gets to
 * `paid` through the payment applier and from there only through the
 * shipments collection, whose hook is the single door into the state
 * machine. That is the whole claim being tested — that there is no other
 * way in, and that the ways that exist refuse what they should.
 *
 * Same guard as the other DB suites: it creates and deletes rows, so it only
 * runs against a disposable database (localhost, or CI's throwaway service).
 */
import { applyPaymentEvent } from "@courvia/commerce-payload";
import type { PaymentEvent } from "@courvia/commerce-domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Everything this file owns, so teardown never guesses. */
const PRODUCT_SLUG = "flf-test-rig";
const SKU = "FLF-RIG-P";
const CARRIER_CODES = ["flf-seur", "flf-dpd-uk", "flf-retired"];
const TRACKING_TEMPLATE = "https://flf.test/track/{tracking}";
const TOTAL = 129_000;
const ADDRESS = {
  name: "Prueba Envíos",
  line1: "Calle Uno 1",
  city: "Madrid",
  postalCode: "28001",
  country: "ES",
};

let payload: BasePayload;
let variantId: number;
let productId: number;
const carrierIds: Record<string, number> = {};

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

/** An order that has genuinely been paid: created as a checkout would leave
 *  it, then moved by the payment applier — never by writing `status`. */
async function paidOrder(email: string): Promise<number> {
  const order = await payload.create({
    collection: "orders",
    overrideAccess: true,
    data: {
      status: "pending_payment",
      market: "es",
      email,
      lines: [{ variant: variantId, sku: SKU, quantity: 1, unitAmount: TOTAL }],
      totalAmount: TOTAL,
      taxAmount: 0,
      refundedAmount: 0,
      shippingAddress: ADDRESS,
    },
  });
  const id = Number(order.id);
  const event: PaymentEvent = {
    type: "paid",
    provider: "stripe",
    providerEventId: `flf_paid_${id}`,
    providerPaymentId: `pi_flf_${id}`,
    orderId: String(id),
    amount: { amount: TOTAL, currency: "EUR" },
    occurredAt: "2026-08-20T10:00:00.000Z",
  };
  const outcome = await applyPaymentEvent(payload, event);
  expect(outcome).toMatchObject({ outcome: "applied", status: "paid" });
  return id;
}

async function statusOf(orderId: number): Promise<string> {
  const order = await payload.findByID({
    collection: "orders",
    id: orderId,
    depth: 0,
    overrideAccess: true,
  });
  return order.status;
}

async function effectsOf(orderId: number): Promise<string[]> {
  const rows = await payload.find({
    collection: "outbox",
    where: { order: { equals: orderId } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  });
  // Every outbox row must still be waiting: enqueued inside the transaction,
  // dispatched only after it commits. A row already marked dispatched would
  // mean something ran while the transaction was open.
  for (const row of rows.docs) expect(row.status).toBe("pending");
  return rows.docs.map((row) => row.effect).sort();
}

async function shipmentsOf(orderId: number): Promise<number> {
  const rows = await payload.find({
    collection: "shipments",
    where: { order: { equals: orderId } },
    depth: 0,
    overrideAccess: true,
  });
  return rows.totalDocs;
}

async function cleanUpOrders(): Promise<void> {
  const orders = await payload.find({
    collection: "orders",
    where: { email: { like: "flf-" } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: {},
  });
  const ids = orders.docs.map((doc) => Number(doc.id));
  if (ids.length === 0) return;
  for (const collection of ["shipments", "outbox", "payments"] as const) {
    await payload.delete({
      collection,
      where: { order: { in: ids } },
      overrideAccess: true,
    });
  }
  await payload.delete({ collection: "orders", where: { id: { in: ids } }, overrideAccess: true });
}

if (hasDb && dbIsDisposable) {
  beforeAll(async () => {
    payload = await loadPayload();
    await cleanUpOrders();

    const product = await payload.create({
      collection: "products",
      locale: "es",
      overrideAccess: true,
      data: {
        title: "Banco de pruebas de envío",
        slug: PRODUCT_SLUG,
        sports: ["padel"],
        launchStatus: "available",
        specs: [],
      },
    });
    productId = Number(product.id);
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: productId, sku: SKU, sport: "padel", active: true },
    });
    variantId = Number(variant.id);
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variantId, qtyOnHand: 50, qtyCommitted: 0 },
    });

    const carriers = [
      { code: "flf-seur", name: "SEUR pruebas", markets: ["es" as const], active: true },
      { code: "flf-dpd-uk", name: "DPD pruebas UK", markets: ["uk" as const], active: true },
      { code: "flf-retired", name: "Retirado", markets: [], active: false },
    ];
    for (const carrier of carriers) {
      const doc = await payload.create({
        collection: "carriers",
        overrideAccess: true,
        data: { ...carrier, trackingUrlTemplate: TRACKING_TEMPLATE },
      });
      carrierIds[carrier.code] = Number(doc.id);
    }
  });

  beforeEach(async () => {
    await cleanUpOrders();
  });

  afterAll(async () => {
    await cleanUpOrders();
    await payload.delete({
      collection: "carriers",
      where: { code: { in: CARRIER_CODES } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "inventory",
      where: { variant: { equals: variantId } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "variants",
      where: { id: { equals: variantId } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "products",
      where: { id: { equals: productId } },
      overrideAccess: true,
    });
  });

  describe("paid → preparing → shipped → delivered", () => {
    it("walks the whole way through the shipments collection", async () => {
      const orderId = await paidOrder("flf-happy@courvia.test");
      expect(await effectsOf(orderId)).toEqual([
        "issue_tax_invoice",
        "notify_crm",
        "send_confirmation_email",
      ]);

      // 1. Opening the shipment is "send it to be picked".
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId },
      });
      expect(await statusOf(orderId)).toBe("preparing");
      expect(await effectsOf(orderId)).toContain("start_picking");
      // The incoterm is the order's market's, stored on the shipment (ADR-08).
      expect(shipment.incoterm).toBe("DDP");

      // 2. Carrier + tracking IS the shipment.
      const shipped = await payload.update({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        data: { carrier: carrierIds["flf-seur"], trackingNumber: "TRK-0001" },
      });
      expect(await statusOf(orderId)).toBe("shipped");
      expect(shipped.shippedAt).toBeTruthy();
      expect(await effectsOf(orderId)).toContain("send_tracking_email");

      // The tracking link is DERIVED, never stored.
      const read = await payload.findByID({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        depth: 0,
      });
      expect(read.trackingUrl).toBe("https://flf.test/track/TRK-0001");

      // And the email got everything it needs to be sent later.
      const tracking = await payload.find({
        collection: "outbox",
        where: {
          and: [{ order: { equals: orderId } }, { effect: { equals: "send_tracking_email" } }],
        },
        depth: 0,
        overrideAccess: true,
      });
      expect(tracking.docs[0]?.payload).toMatchObject({
        carrier: "flf-seur",
        trackingNumber: "TRK-0001",
        trackingUrl: "https://flf.test/track/TRK-0001",
        incoterm: "DDP",
      });

      // 3. Dating the delivery closes it and opens the withdrawal window.
      await payload.update({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        data: { deliveredAt: "2026-08-25T09:00:00.000Z" },
      });
      expect(await statusOf(orderId)).toBe("delivered");
      expect(await effectsOf(orderId)).toEqual([
        "issue_tax_invoice",
        "notify_crm",
        "open_withdrawal_window",
        "send_confirmation_email",
        "send_post_sale_email",
        "send_tracking_email",
        "start_picking",
      ]);

      // The withdrawal window carries the market, not a hard-coded 14 days:
      // the period is law, and the law differs per market.
      const withdrawal = await payload.find({
        collection: "outbox",
        where: {
          and: [{ order: { equals: orderId } }, { effect: { equals: "open_withdrawal_window" } }],
        },
        depth: 0,
        overrideAccess: true,
      });
      expect(withdrawal.docs[0]?.payload).toMatchObject({ market: "es" });
    });

    it("fixes every past tracking link when a template is corrected", async () => {
      const orderId = await paidOrder("flf-template@courvia.test");
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId, carrier: carrierIds["flf-seur"], trackingNumber: "TRK-TPL" },
      });
      await payload.update({
        collection: "carriers",
        id: carrierIds["flf-seur"]!,
        overrideAccess: true,
        data: { trackingUrlTemplate: "https://flf.test/nuevo?ref={tracking}" },
      });
      const read = await payload.findByID({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        depth: 0,
      });
      expect(read.trackingUrl).toBe("https://flf.test/nuevo?ref=TRK-TPL");
      await payload.update({
        collection: "carriers",
        id: carrierIds["flf-seur"]!,
        overrideAccess: true,
        data: { trackingUrlTemplate: TRACKING_TEMPLATE },
      });
    });
  });

  describe("what the door refuses", () => {
    it("will not deliver something that never shipped", async () => {
      const orderId = await paidOrder("flf-early@courvia.test");
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId },
      });
      await expect(
        payload.update({
          collection: "shipments",
          id: shipment.id,
          overrideAccess: true,
          data: { deliveredAt: "2026-08-25T09:00:00.000Z" },
        }),
      ).rejects.toThrow(/preparing/);
      // Rolled back whole: the order did not move and the date did not stick.
      expect(await statusOf(orderId)).toBe("preparing");
      const read = await payload.findByID({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        depth: 0,
      });
      expect(read.deliveredAt).toBeFalsy();
    });

    it("will not ship a cancelled order, and leaves no shipment behind", async () => {
      const order = await payload.create({
        collection: "orders",
        overrideAccess: true,
        data: {
          status: "pending_payment",
          market: "es",
          email: "flf-cancelled@courvia.test",
          lines: [{ variant: variantId, sku: SKU, quantity: 1, unitAmount: TOTAL }],
          totalAmount: TOTAL,
          taxAmount: 0,
          refundedAmount: 0,
          shippingAddress: ADDRESS,
        },
      });
      const orderId = Number(order.id);
      await applyPaymentEvent(payload, {
        type: "failed",
        provider: "stripe",
        providerEventId: `flf_failed_${orderId}`,
        providerPaymentId: `pi_flf_${orderId}`,
        orderId: String(orderId),
        amount: { amount: 0, currency: "EUR" },
        occurredAt: "2026-08-20T10:00:00.000Z",
      });
      expect(await statusOf(orderId)).toBe("cancelled");

      await expect(
        payload.create({
          collection: "shipments",
          overrideAccess: true,
          data: { order: orderId, carrier: carrierIds["flf-seur"], trackingNumber: "TRK-NOPE" },
        }),
      ).rejects.toThrow(/cancelled/);
      expect(await shipmentsOf(orderId)).toBe(0);
      expect(await statusOf(orderId)).toBe("cancelled");
    });

    it("freezes fulfilment while a refund is being decided", async () => {
      const orderId = await paidOrder("flf-refund@courvia.test");
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId },
      });
      // Support requesting a refund has no surface of its own yet (it needs
      // human approval and its own task), so the request is simulated here.
      // What is under test is the fulfilment side: an order waiting on a
      // refund must not slip out of the warehouse.
      await payload.update({
        collection: "orders",
        id: orderId,
        overrideAccess: true,
        data: { status: "refund_requested" },
      });
      await expect(
        payload.update({
          collection: "shipments",
          id: shipment.id,
          overrideAccess: true,
          data: { carrier: carrierIds["flf-seur"], trackingNumber: "TRK-FROZEN" },
        }),
      ).rejects.toThrow(/refund_requested/);
      expect(await statusOf(orderId)).toBe("refund_requested");
      expect(await effectsOf(orderId)).not.toContain("send_tracking_email");
    });

    it("refuses a courier that does not operate in the order's market", async () => {
      const orderId = await paidOrder("flf-market@courvia.test");
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId },
      });
      await expect(
        payload.update({
          collection: "shipments",
          id: shipment.id,
          overrideAccess: true,
          data: { carrier: carrierIds["flf-dpd-uk"], trackingNumber: "TRK-UK" },
        }),
      ).rejects.toThrow(/ES/);
      await expect(
        payload.update({
          collection: "shipments",
          id: shipment.id,
          overrideAccess: true,
          data: { carrier: carrierIds["flf-retired"], trackingNumber: "TRK-OLD" },
        }),
      ).rejects.toThrow(/Retirado/);
      expect(await statusOf(orderId)).toBe("preparing");
    });

    it("refuses a second shipment for the same order", async () => {
      const orderId = await paidOrder("flf-second@courvia.test");
      await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId },
      });
      await expect(
        payload.create({
          collection: "shipments",
          overrideAccess: true,
          data: { order: orderId },
        }),
      ).rejects.toThrow(/ya tiene un envío/);
      expect(await shipmentsOf(orderId)).toBe(1);
    });
  });

  describe("replays", () => {
    it("re-dating a delivered shipment changes nothing and is not an error", async () => {
      const orderId = await paidOrder("flf-replay@courvia.test");
      const shipment = await payload.create({
        collection: "shipments",
        overrideAccess: true,
        data: { order: orderId, carrier: carrierIds["flf-seur"], trackingNumber: "TRK-RP" },
      });
      await payload.update({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        data: { deliveredAt: "2026-08-25T09:00:00.000Z" },
      });
      const before = await effectsOf(orderId);
      expect(await statusOf(orderId)).toBe("delivered");

      // Operator clears the date and types it again — the second delivery
      // trigger lands on an order that is already delivered. `already_applied`
      // in the machine, a no-op here: no error, no second post-sale email.
      await payload.update({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        data: { deliveredAt: null },
      });
      await payload.update({
        collection: "shipments",
        id: shipment.id,
        overrideAccess: true,
        data: { deliveredAt: "2026-08-26T09:00:00.000Z" },
      });
      expect(await statusOf(orderId)).toBe("delivered");
      expect(await effectsOf(orderId)).toEqual(before);
    });
  });
} else {
  describe.skip("fulfilment (requires a DISPOSABLE DATABASE_URL: localhost or CI)", () => {
    it("skipped", () => undefined);
  });
}
