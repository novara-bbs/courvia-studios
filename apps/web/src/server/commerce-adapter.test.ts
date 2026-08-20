/**
 * The real adapter, through the real composition root, against a real
 * Postgres (`pnpm seed:markets` for MarketSettings). Skipped when no
 * DATABASE_URL is configured; CI provides one plus migrations and seeds.
 *
 * The purchasable fixtures are TEST-OWNED: the real catalog (ADR-022) is
 * all-waitlist with no prices by design, so this suite seeds its own
 * disposable priced product in beforeAll and removes it in afterAll —
 * checkout, stock and the payment pipeline stay covered without giving the
 * marketing catalog a fake price.
 *
 * Covers the FULL CommerceService contract (catalog + checkout, ADR-13's
 * proof) and the §4 payment pipeline: ledger-first idempotency, state
 * machine in a transaction, stock movements and the outbox.
 */
import { CheckoutError } from "@courvia/commerce-domain";
import type { PaymentEvent } from "@courvia/commerce-domain";
import { describeCommerceServiceContract } from "@courvia/commerce-domain/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
// This suite WIPES orders/payments/outbox/returns and rewrites inventory:
// it only ever runs against a disposable database — localhost, or CI's
// throwaway service. Point DATABASE_URL anywhere else and it skips.
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";
// The fake gateway drives checkout/webhooks end-to-end without credentials.
process.env.PAYMENT_FAKE_SECRET ??= "test-secret";

const CHECKOUT_INPUT = {
  market: "es" as const,
  lines: [{ sku: "TST-RIG-P", quantity: 1 }],
  email: "contract@courvia.test",
  provider: "stripe" as const,
  shippingAddress: {
    name: "Test",
    line1: "Calle Uno 1",
    city: "Madrid",
    postalCode: "28001",
    country: "ES",
  },
};

async function loadContainer() {
  return import("./container");
}

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

/** Test-owned purchasable stock: 9 on the checkout SKU (the "5+5 must fail
 *  as a sum" case depends on it), 12 on the secondary reserve/release SKU. */
const TEST_STOCK: Record<string, number> = {
  "TST-RIG-P": 9,
  "TST-RIG-B": 12,
};

const TEST_PRICES: Record<string, Partial<Record<"es" | "uk", number>>> = {
  // 129000 is what the checkout total assertions expect.
  "TST-RIG-P": { es: 129_000, uk: 112_000 },
  "TST-RIG-B": { es: 99_000 },
};

/** Creates the disposable priced product the suite checks out against. */
async function seedTestCatalog() {
  const payload = await loadPayload();
  const existing = await payload.find({
    collection: "products",
    where: { slug: { equals: "test-rig" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return;
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Test Rig",
      slug: "test-rig",
      sports: ["padel"],
      excerpt: "Banco de pruebas del contrato de commerce. No es un producto.",
      specs: [],
      launchStatus: "available",
      _status: "published",
    },
  });
  for (const [sku, prices] of Object.entries(TEST_PRICES)) {
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: product.id, sku, sport: "padel", active: true },
    });
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variant.id, qtyOnHand: TEST_STOCK[sku] ?? 0, qtyCommitted: 0 },
    });
    for (const [market, amount] of Object.entries(prices)) {
      await payload.create({
        collection: "prices",
        overrideAccess: true,
        data: {
          variant: variant.id,
          market: market as "es" | "uk",
          amount,
          taxBehavior: "inclusive",
          active: true,
        },
      });
    }
  }
}

/** Removes the rig (and its variants/prices/inventory) from the shared DB. */
async function removeTestCatalog() {
  const payload = await loadPayload();
  const product = (
    await payload.find({
      collection: "products",
      where: { slug: { equals: "test-rig" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];
  if (product === undefined) return;
  const variants = await payload.find({
    collection: "variants",
    where: { product: { equals: product.id } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  const variantIds = variants.docs.map((doc) => doc.id);
  if (variantIds.length > 0) {
    await payload.delete({
      collection: "prices",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "inventory",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "variants",
      where: { id: { in: variantIds } },
      overrideAccess: true,
    });
  }
  await payload.delete({ collection: "products", where: { id: { equals: product.id } }, overrideAccess: true });
}

async function resetCommerceRows() {
  const payload = await loadPayload();
  for (const collection of ["outbox", "payments", "returns"] as const) {
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true });
  }
  await payload.delete({
    collection: "orders",
    where: { id: { exists: true } },
    overrideAccess: true,
  });
  const variants = await payload.find({
    collection: "variants",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  const skuByVariant = new Map(variants.docs.map((doc) => [doc.id, doc.sku]));
  const inventory = await payload.find({
    collection: "inventory",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  for (const row of inventory.docs) {
    const variantId = typeof row.variant === "object" ? row.variant.id : row.variant;
    const sku = skuByVariant.get(variantId);
    const qtyOnHand = sku !== undefined && sku in TEST_STOCK ? TEST_STOCK[sku]! : row.qtyOnHand;
    await payload.update({
      collection: "inventory",
      id: row.id,
      data: { qtyOnHand, qtyCommitted: 0 },
      overrideAccess: true,
    });
  }
}

if (hasDb && dbIsDisposable) {
  beforeAll(async () => {
    await seedTestCatalog();
    await resetCommerceRows();
  });
  afterAll(async () => {
    await resetCommerceRows();
    await removeTestCatalog();
  });

  describeCommerceServiceContract(
    "PayloadCommerceService (via container)",
    async () => {
      const { getCommerce } = await loadContainer();
      return getCommerce("es");
    },
    {
      knownSlug: "test-rig",
      unknownSlug: "no-such-robot",
      knownSku: "TST-RIG-P",
      unknownSku: "NOPE-0",
      market: "es",
      otherMarket: "uk",
      checkout: CHECKOUT_INPUT,
    },
  );

  describe("checkout guardrails (§4)", () => {
    it("rejects a provider the market does not offer", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      await expect(
        service.createCheckout({ ...CHECKOUT_INPUT, provider: "tabby" }),
      ).rejects.toMatchObject({ code: "provider_not_available" });
    });

    it("rejects an unknown sku with a typed code", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      const failure = await service
        .createCheckout({ ...CHECKOUT_INPUT, lines: [{ sku: "NOPE-0", quantity: 1 }] })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(CheckoutError);
      expect((failure as CheckoutError).code).toBe("unknown_sku");
    });

    it("rejects quantities beyond available stock", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      await expect(
        service.createCheckout({ ...CHECKOUT_INPUT, lines: [{ sku: "TST-RIG-P", quantity: 999 }] }),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("reserves stock on checkout and computes the total server-side", async () => {
      const { getCommerce } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const before = await service.getAvailability(["TST-RIG-P"]);
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      const after = await service.getAvailability(["TST-RIG-P"]);
      expect(after[0]!.available).toBe(before[0]!.available - 1);

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      // 129000 comes from the prices table, not from anything the client sent.
      expect(order?.total).toMatchObject({ amount: 129_000, currency: "EUR" });

      const stored = await payload.findByID({
        collection: "orders",
        id: Number(checkout.orderId),
        depth: 0,
        overrideAccess: true,
      });
      expect(stored.providerPaymentId).toBe(`pi_${checkout.orderId}`);
    });
  });

  describe("checkout expiry sweep", () => {
    it("expires a stale pending_payment checkout and releases its reservation", async () => {
      const { getCommerce } = await loadContainer();
      const { expireStaleCheckouts } = await import("@courvia/commerce-payload");
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const before = await service.getAvailability(["TST-RIG-B"]);
      const checkout = await service.createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ sku: "TST-RIG-B", quantity: 2 }],
        email: "expiry@courvia.test",
      });
      const reserved = await service.getAvailability(["TST-RIG-B"]);
      expect(reserved[0]!.available).toBe(before[0]!.available - 2);

      // "Older than an hour", measured by a clock an hour ahead: the fresh
      // order qualifies without touching createdAt.
      const result = await expireStaleCheckouts(payload, {
        olderThanMinutes: 60,
        now: () => Date.now() + 61 * 60_000,
      });
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("cancelled");
      const released = await service.getAvailability(["TST-RIG-B"]);
      expect(released[0]!.available).toBe(before[0]!.available);

      // Idempotent: a second sweep finds nothing to move on this order.
      await expireStaleCheckouts(payload, {
        olderThanMinutes: 60,
        now: () => Date.now() + 61 * 60_000,
      });
      const still = await service.getOrder(checkout.orderId);
      expect(still?.status).toBe("cancelled");
    });
  });

  describe("payment pipeline (§4: ledger-first, transactional, outbox)", () => {
    function paidEvent(orderId: string, eventId: string): PaymentEvent {
      return {
        type: "paid",
        provider: "stripe",
        providerEventId: eventId,
        providerPaymentId: `pi_${orderId}`,
        orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      };
    }

    it("paid moves the order, commits stock and fills the outbox — once", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      const first = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_1"));
      expect(first).toMatchObject({ outcome: "applied", status: "paid" });

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("paid");

      const outbox = await payload.find({
        collection: "outbox",
        where: { order: { equals: Number(checkout.orderId) } },
        depth: 0,
        overrideAccess: true,
      });
      const effects = outbox.docs.map((doc) => doc.effect).sort();
      expect(effects).toEqual(["issue_tax_invoice", "notify_crm", "send_confirmation_email"]);

      // Same event id replayed: the UNIQUE ledger row absorbs it, no effects.
      const replay = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_1"));
      expect(replay).toMatchObject({ outcome: "duplicate" });

      // A DIFFERENT event that says the same thing: expected replay, logged,
      // no second transition and no extra outbox rows.
      const semantic = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_2"));
      expect(semantic).toMatchObject({ outcome: "already_applied" });
      const outboxAfter = await payload.find({
        collection: "outbox",
        where: { order: { equals: Number(checkout.orderId) } },
        depth: 0,
        overrideAccess: true,
      });
      expect(outboxAfter.totalDocs).toBe(outbox.totalDocs);
    });

    it("a refund webhook out of order is rejected as invalid, not applied", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);

      // pending_payment does not accept payment.refunded (docs/data-model.md §10.2).
      const result = await applyPaymentEvent({
        type: "refunded",
        provider: "stripe",
        providerEventId: "evt_refund_early",
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        partial: false,
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(result).toMatchObject({ outcome: "invalid" });
      // Rolled back entirely: the same event id can apply cleanly later.
      const retried = await applyPaymentEvent({
        type: "paid",
        provider: "stripe",
        providerEventId: "evt_refund_early",
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(retried).toMatchObject({ outcome: "applied", status: "paid" });
    });

    it("an underpaid signed event is a CONFLICT: alert row, order untouched", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);

      const result = await applyPaymentEvent({
        type: "paid",
        provider: "stripe",
        providerEventId: `evt_underpaid_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 1, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(result.outcome).toBe("conflict");

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      const alerts = await payload.find({
        collection: "outbox",
        where: {
          and: [
            { order: { equals: Number(checkout.orderId) } },
            { effect: { equals: "alert_payment_conflict" } },
          ],
        },
        overrideAccess: true,
      });
      expect(alerts.totalDocs).toBe(1);
    });

    it("paid arriving on a cancelled order raises a conflict, never silence", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent({
        type: "failed",
        provider: "stripe",
        providerEventId: `evt_fail_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 0, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect((await service.getOrder(checkout.orderId))?.status).toBe("cancelled");

      const late = await applyPaymentEvent(paidEvent(checkout.orderId, `evt_late_${checkout.orderId}`));
      expect(late.outcome).toBe("conflict");
      const alerts = await payload.find({
        collection: "outbox",
        where: {
          and: [
            { order: { equals: Number(checkout.orderId) } },
            { effect: { equals: "alert_payment_conflict" } },
          ],
        },
        overrideAccess: true,
      });
      expect(alerts.totalDocs).toBe(1);
    });

    it("a stale failed AFTER paid is a replay, not an error loop", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_pd_${checkout.orderId}`));

      const stale = await applyPaymentEvent({
        type: "failed",
        provider: "stripe",
        providerEventId: `evt_stale_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 0, currency: "EUR" },
        occurredAt: "2026-08-19T11:59:00.000Z",
      });
      expect(stale.outcome).toBe("already_applied");
      expect((await service.getOrder(checkout.orderId))?.status).toBe("paid");
    });

    it("cumulative refunds land as deltas: partial, then the remainder", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_p1_${checkout.orderId}`));
      await payload.update({
        collection: "orders",
        id: Number(checkout.orderId),
        data: { status: "refund_requested" },
        overrideAccess: true,
      });

      const refund = (cum: number, id: string) =>
        applyPaymentEvent({
          type: "refunded",
          provider: "stripe",
          providerEventId: id,
          providerPaymentId: `pi_${checkout.orderId}`,
          orderId: checkout.orderId,
          amount: { amount: cum, currency: "EUR" },
          partial: cum < 129_000,
          cumulative: true,
          occurredAt: "2026-08-19T13:00:00.000Z",
        });

      const first = await refund(50_000, `evt_r1_${checkout.orderId}`);
      expect(first).toMatchObject({ outcome: "applied", status: "partially_refunded" });

      // Same cumulative total replayed under a new id: zero delta, absorbed.
      const replay = await refund(50_000, `evt_r1b_${checkout.orderId}`);
      expect(replay).toMatchObject({ outcome: "already_applied" });

      // The remainder arrives as the new running total.
      const second = await refund(129_000, `evt_r2_${checkout.orderId}`);
      expect(second).toMatchObject({ outcome: "applied", status: "refunded" });
      const order = await service.getOrder(checkout.orderId);
      expect(order?.refundedTotal).toMatchObject({ amount: 129_000 });
    });

    it("duplicate SKU lines are aggregated before the stock check", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      // 9 on hand: 5+5 must fail as a SUM even though each line alone fits.
      await expect(
        service.createCheckout({
          ...CHECKOUT_INPUT,
          lines: [
            { sku: "TST-RIG-P", quantity: 5 },
            { sku: "TST-RIG-P", quantity: 5 },
          ],
        }),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("refund after approval reaches refunded and tracks the refunded total", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_paid_${checkout.orderId}`));
      // Support marks the refund request (manual-assisted phase 1).
      await payload.update({
        collection: "orders",
        id: Number(checkout.orderId),
        data: { status: "refund_requested" },
        overrideAccess: true,
      });

      const result = await applyPaymentEvent({
        type: "refunded",
        provider: "stripe",
        providerEventId: `evt_refund_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 50_000, currency: "EUR" },
        partial: true,
        occurredAt: "2026-08-19T13:00:00.000Z",
      });
      expect(result).toMatchObject({ outcome: "applied", status: "partially_refunded" });
      const order = await service.getOrder(checkout.orderId);
      expect(order?.refundedTotal).toMatchObject({ amount: 50_000 });
    });
  });
} else {
  describe.skip("PayloadCommerceService contract (requires a DISPOSABLE DATABASE_URL: localhost or CI)", () => {
    it("skipped", () => undefined);
  });
}
