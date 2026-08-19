/**
 * The real adapter, through the real composition root, against a real
 * Postgres with the seeded demo catalog (`pnpm seed:catalog` +
 * `pnpm seed:markets`). Skipped when no DATABASE_URL is configured; CI
 * provides one plus migrations and seeds.
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
  lines: [{ sku: "DRL-PRO-P", quantity: 1 }],
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

/** The canonical seed stock (src/payload/seed-catalog.ts): tests commit
 *  real units, so both hooks restore this exact profile — runs stay
 *  deterministic and the dev DB keeps its demo state (incl. the agotado). */
const SEED_STOCK: Record<string, number> = {
  "DRL-ONE-P": 12,
  "DRL-ONE-T": 8,
  "DRL-PRO-P": 9,
  "DRL-PRO-T": 0,
  "DRL-PRO-PB": 5,
  "DRL-CLB-P": 3,
  "DRL-CLB-T": 2,
};

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
    const qtyOnHand = sku !== undefined && sku in SEED_STOCK ? SEED_STOCK[sku]! : row.qtyOnHand;
    await payload.update({
      collection: "inventory",
      id: row.id,
      data: { qtyOnHand, qtyCommitted: 0 },
      overrideAccess: true,
    });
  }
}

if (hasDb && dbIsDisposable) {
  beforeAll(resetCommerceRows);
  afterAll(resetCommerceRows);

  describeCommerceServiceContract(
    "PayloadCommerceService (via container)",
    async () => {
      const { getCommerce } = await loadContainer();
      return getCommerce("es");
    },
    {
      knownSlug: "drill-pro",
      unknownSlug: "no-such-robot",
      knownSku: "DRL-PRO-P",
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
        service.createCheckout({ ...CHECKOUT_INPUT, lines: [{ sku: "DRL-PRO-P", quantity: 999 }] }),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("reserves stock on checkout and computes the total server-side", async () => {
      const { getCommerce } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const before = await service.getAvailability(["DRL-PRO-P"]);
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      const after = await service.getAvailability(["DRL-PRO-P"]);
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

      // pending_payment does not accept payment.refunded (§10.2).
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
            { sku: "DRL-PRO-P", quantity: 5 },
            { sku: "DRL-PRO-P", quantity: 5 },
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
