/**
 * The real adapter, through the real composition root, against a real
 * Postgres with the seeded demo catalog (`pnpm seed:catalog`). Skipped when
 * no DATABASE_URL is configured; CI provides one plus migrations and seeds.
 */
import { NotImplementedError } from "@courvia/commerce-domain";
import { describeCatalogContract } from "@courvia/commerce-domain/testing";
import { describe, expect, it } from "vitest";

import { getCommerce } from "./container";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

if (hasDb) {
  describeCatalogContract("PayloadCommerceService (via container)", () => getCommerce("es"), {
    knownSlug: "drill-pro",
    unknownSlug: "no-such-robot",
    knownSku: "DRL-PRO-P",
    unknownSku: "NOPE-0",
    market: "es",
    otherMarket: "uk",
  });

  describe("checkout half is staged, not pretended", () => {
    it("createCheckout throws NotImplementedError until S2", async () => {
      const service = await getCommerce("es");
      await expect(
        service.createCheckout({
          market: "es",
          lines: [{ sku: "DRL-PRO-P", quantity: 1 }],
          email: "test@example.com",
          provider: "stripe",
          shippingAddress: {
            name: "Test",
            line1: "Calle Uno 1",
            city: "Madrid",
            postalCode: "28001",
            country: "ES",
          },
        }),
      ).rejects.toBeInstanceOf(NotImplementedError);
    });
  });

  describe("localized reads", () => {
    it("serves the locale it was built for", async () => {
      const es = await getCommerce("es");
      const en = await getCommerce("en");
      const [a, b] = await Promise.all([
        es.getProductDetail("drill-pro", "es"),
        en.getProductDetail("drill-pro", "uk"),
      ]);
      expect(a?.product.excerpt).toContain("sparring que no se cansa");
      expect(b?.product.excerpt).toContain("never tires");
    });
  });
} else {
  describe.skip("PayloadCommerceService contract (requires DATABASE_URL)", () => {
    it("skipped", () => undefined);
  });
}
