/**
 * Reusable port contract suites.
 *
 * Every adapter — the in-memory fakes today, commerce-payload and
 * payments-stripe tomorrow, commerce-medusa if the §18 gate ever opens —
 * runs the identical suite. This is the mechanism that makes ADR-13's
 * "swap the gateway without touching the domain" true rather than
 * aspirational, and it is what makes an unimplementable port signature fail
 * immediately instead of in the sprint that first needs it.
 *
 * Imported by test files only; `vitest` is a devDependency of the consumer.
 */
import { describe, expect, it } from "vitest";

import type { MarketId } from "@courvia/platform";

import { WebhookSignatureError } from "../payment";
import type { PaymentProvider } from "../payment";
import type { CommerceService } from "../commerce-service";
import type { CheckoutInput } from "../types";

export interface PaymentProviderFixtures {
  /** A raw body the provider must accept, with its valid signature. */
  valid: { rawBody: string; signature: string; expectedEventId: string };
  /** Raw body whose normalized event the domain ignores (e.g. a ping). */
  ignored: { rawBody: string; signature: string };
}

export function describePaymentProviderContract(
  name: string,
  make: () => PaymentProvider,
  fixtures: PaymentProviderFixtures,
): void {
  describe(`PaymentProvider contract: ${name}`, () => {
    it("verifies a genuine signature and surfaces the provider event id", async () => {
      const provider = make();
      const event = await provider.verifyWebhook(
        fixtures.valid.rawBody,
        fixtures.valid.signature,
      );
      expect(event.provider).toBe(provider.id);
      expect(event.providerEventId).toBe(fixtures.valid.expectedEventId);
    });

    it("rejects a tampered body with the same signature", async () => {
      const provider = make();
      await expect(
        provider.verifyWebhook(`${fixtures.valid.rawBody} `, fixtures.valid.signature),
      ).rejects.toBeInstanceOf(WebhookSignatureError);
    });

    it("rejects a tampered signature", async () => {
      const provider = make();
      await expect(
        provider.verifyWebhook(fixtures.valid.rawBody, "0".repeat(64)),
      ).rejects.toBeInstanceOf(WebhookSignatureError);
    });

    it("normalizes a verified event into the domain shape", async () => {
      const provider = make();
      const raw = await provider.verifyWebhook(
        fixtures.valid.rawBody,
        fixtures.valid.signature,
      );
      const normalized = provider.normalizeEvent(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.providerEventId).toBe(raw.providerEventId);
      expect(normalized?.amount.amount).toBeTypeOf("number");
      expect(Number.isSafeInteger(normalized?.amount.amount)).toBe(true);
    });

    it("returns null — never throws — for events the domain ignores", async () => {
      const provider = make();
      const raw = await provider.verifyWebhook(
        fixtures.ignored.rawBody,
        fixtures.ignored.signature,
      );
      expect(provider.normalizeEvent(raw)).toBeNull();
    });

    it("refunds through the provider and reports an outcome", async () => {
      const provider = make();
      const result = await provider.refund("pi_test");
      expect(["succeeded", "pending", "failed"]).toContain(result.status);
      expect(result.provider).toBe(provider.id);
    });
  });
}

export interface CatalogFixtures {
  knownSlug: string;
  unknownSlug: string;
  knownSku: string;
  unknownSku: string;
  market: MarketId;
  /** A market other than `market`, to prove per-market pricing. */
  otherMarket: MarketId;
}

export interface CommerceServiceFixtures extends CatalogFixtures {
  checkout: CheckoutInput;
}

/**
 * The catalog half of the port: what a storefront needs before payments
 * exist. Adapters implement this first; the checkout half joins in S2 and
 * until then the adapter must THROW NotImplementedError, never pretend.
 */
export function describeCatalogContract(
  name: string,
  make: () => Promise<CommerceService> | CommerceService,
  fixtures: CatalogFixtures,
): void {
  describe(`Catalog contract: ${name}`, () => {
    it("returns the full PDP view in one market-aware call", async () => {
      const service = await make();
      const detail = await service.getProductDetail(fixtures.knownSlug, fixtures.market);
      expect(detail?.product.slug).toBe(fixtures.knownSlug);
      expect(detail?.variants.length).toBeGreaterThan(0);
      const priced = detail?.variants.find((v) => v.price !== null);
      expect(priced, "at least one variant must carry a price in the market").toBeDefined();
      expect(priced?.price?.currency).toBeDefined();
      expect(detail?.variants.every((v) => Number.isSafeInteger(v.available))).toBe(true);
    });

    it("returns null for an unknown slug instead of throwing", async () => {
      const service = await make();
      expect(await service.getProductDetail(fixtures.unknownSlug, fixtures.market)).toBeNull();
    });

    it("lists summaries with a from-price for the requested market", async () => {
      const service = await make();
      const all = await service.listProducts({ market: fixtures.market });
      expect(all.length).toBeGreaterThan(0);
      const withPrice = all.find((p) => p.fromPrice !== null);
      expect(withPrice, "at least one summary must carry fromPrice").toBeDefined();
      expect((await service.listProducts({ limit: 1 })).length).toBeLessThanOrEqual(1);
    });

    it("prices differ by market, never converted at runtime (ADR-05)", async () => {
      const service = await make();
      const detail = await service.getProductDetail(fixtures.knownSlug, fixtures.market);
      const other = await service.getProductDetail(fixtures.knownSlug, fixtures.otherMarket);
      const a = detail?.variants.find((v) => v.price !== null)?.price;
      // The other market either has its own currency price or no price at
      // all — silently reusing the first market's currency would be the bug.
      const b = other?.variants.map((v) => v.price).find((p) => p !== null);
      if (a && b) expect(b.currency).not.toBe(a.currency);
    });

    it("answers availability in one batched call, preserving order", async () => {
      const service = await make();
      const skus = [fixtures.knownSku, fixtures.unknownSku];
      const availability = await service.getAvailability(skus);
      expect(availability.map((a) => a.sku)).toEqual(skus);
      expect(availability.every((a) => Number.isSafeInteger(a.available))).toBe(true);
    });
  });
}

export function describeCommerceServiceContract(
  name: string,
  make: () => Promise<CommerceService> | CommerceService,
  fixtures: CommerceServiceFixtures,
): void {
  describeCatalogContract(name, make, fixtures);

  describe(`Checkout contract: ${name}`, () => {
    it("creates a checkout whose totals are computed server-side", async () => {
      const service = await make();
      const checkout = await service.createCheckout(fixtures.checkout);
      expect(checkout.orderId).toBeTruthy();
      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      expect(order?.total.currency).toBe(order?.currency);
      expect(order?.total.amount).toBeGreaterThan(0);
    });

    it("returns null for an unknown order", async () => {
      const service = await make();
      expect(await service.getOrder("order_does_not_exist")).toBeNull();
    });

    it("opens a return request against an existing order", async () => {
      const service = await make();
      const checkout = await service.createCheckout(fixtures.checkout);
      const request = await service.requestReturn({
        orderId: checkout.orderId,
        lines: fixtures.checkout.lines,
        reason: "damaged",
      });
      expect(request.status).toBe("requested");
      expect(request.orderId).toBe(checkout.orderId);
    });
  });
}
