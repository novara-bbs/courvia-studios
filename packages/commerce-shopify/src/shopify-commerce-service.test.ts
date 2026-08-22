/**
 * The portability claim, executable.
 *
 * `describeCatalogContract` is the SAME suite `commerce-payload` runs. If it
 * passes here, "the frontend consumes only the port" stops being a sentence
 * in CLAUDE.md §3.1 and becomes a fact a second, wholly unrelated backend
 * satisfies. The checkout half is asserted to throw, because the contract
 * explicitly prefers a loud NotImplementedError to a convincing lie.
 */
import { NotImplementedError, money } from "@courvia/commerce-domain";
import type { CheckoutInput } from "@courvia/commerce-domain";
import { describeCatalogContract } from "@courvia/commerce-domain/testing";
import { describe, expect, it } from "vitest";

import { fixtureStorefront } from "./fixture-shop";
import { toAvailable, toMinorUnits } from "./mapping";
import { ShopifyCommerceService } from "./shopify-commerce-service";

const make = (): ShopifyCommerceService =>
  new ShopifyCommerceService({ fetch: fixtureStorefront() });

describeCatalogContract("commerce-shopify", make, {
  knownSlug: "tempo-r1",
  unknownSlug: "no-such-robot",
  knownSku: "TEMPO-R1-PADEL",
  unknownSku: "NOPE-000",
  market: "es",
  otherMarket: "uk",
});

describe("the half Shopify keeps for itself", () => {
  const CHECKOUT: CheckoutInput = {
    market: "es",
    lines: [{ sku: "TEMPO-R1-PADEL", quantity: 1 }],
    email: "jugador@example.com",
    shippingAddress: {
      name: "Jugador",
      line1: "Calle Pista 1",
      city: "Madrid",
      postalCode: "28001",
      country: "ES",
    },
    provider: "stripe",
  };

  it("throws NotImplementedError for createCheckout instead of inventing an order", () => {
    expect(() => make().createCheckout(CHECKOUT)).toThrow(NotImplementedError);
  });

  it("throws NotImplementedError for getOrder", () => {
    expect(() => make().getOrder("gid://shopify/Order/1")).toThrow(NotImplementedError);
  });

  it("throws NotImplementedError for requestReturn", () => {
    expect(() =>
      make().requestReturn({
        orderId: "gid://shopify/Order/1",
        lines: CHECKOUT.lines,
        reason: "damaged",
      }),
    ).toThrow(NotImplementedError);
  });
});

describe("money crosses the boundary exactly", () => {
  it("parses decimal strings without float arithmetic", () => {
    expect(toMinorUnits({ amount: "1290.00", currencyCode: "EUR" })).toEqual(money(129000, "EUR"));
    // The value that makes `parseFloat(x) * 100` produce 89049.99999999999.
    expect(toMinorUnits({ amount: "890.50", currencyCode: "EUR" })).toEqual(money(89050, "EUR"));
    expect(toMinorUnits({ amount: "0.1", currencyCode: "EUR" })).toEqual(money(10, "EUR"));
    expect(toMinorUnits({ amount: "7", currencyCode: "GBP" })).toEqual(money(700, "GBP"));
  });

  it("refuses a currency Courvia does not sell in", () => {
    expect(() => toMinorUnits({ amount: "10.00", currencyCode: "JPY" })).toThrow(
      /not a Courvia currency/,
    );
  });

  it("refuses more precision than the currency has, rather than rounding", () => {
    expect(() => toMinorUnits({ amount: "10.005", currencyCode: "EUR" })).toThrow(/finer than/);
    // Trailing zeros beyond the exponent are not extra precision.
    expect(toMinorUnits({ amount: "10.500", currencyCode: "EUR" })).toEqual(money(1050, "EUR"));
  });
});

describe("the leak the port cannot close (ADR-024 §3.1)", () => {
  it("reports a real count when the shop publishes inventory", () => {
    expect(toAvailable({ id: "v", sku: "s", title: "t", price: { amount: "1", currencyCode: "EUR" }, availableForSale: true, quantityAvailable: 12 })).toBe(12);
  });

  it("says «not counted» instead of inventing a 1 — the leak got smaller", () => {
    // Esto devolvía `1`, y `1` en una tienda se lee «queda uno»: metía prisa
    // a un cliente al que nadie estaba metiendo prisa. Desde que
    // `Availability.available` es `number | null`, la rama sin cuenta tiene
    // dónde caer con la verdad.
    expect(toAvailable({ id: "v", sku: "s", title: "t", price: { amount: "1", currencyCode: "EUR" }, availableForSale: true })).toBeNull();
    // `false` SÍ es una cuenta que la tienda publicó: cero.
    expect(toAvailable({ id: "v", sku: "s", title: "t", price: { amount: "1", currencyCode: "EUR" }, availableForSale: false })).toBe(0);
  });
});

describe("market pricing", () => {
  it("quotes each market in its own currency, never converted (ADR-05)", async () => {
    const service = make();
    const es = await service.getProductDetail("tempo-r1", "es");
    const uk = await service.getProductDetail("tempo-r1", "uk");
    const ae = await service.getProductDetail("tempo-r1", "ae");
    expect(es?.variants[0]?.price).toEqual(money(129000, "EUR"));
    expect(uk?.variants[0]?.price).toEqual(money(115000, "GBP"));
    expect(ae?.variants[0]?.price).toEqual(money(540000, "AED"));
  });
});

describe("batched availability", () => {
  it("answers in request order even when a SKU is unknown", async () => {
    const availability = await make().getAvailability([
      "NOPE-000",
      "TEMPO-R1-PADEL",
      "GO-PICKLEBALL",
    ]);
    expect(availability).toEqual([
      // Desconocido: `null`, no cero.
      { sku: "NOPE-000", available: null },
      // La tienda publica `quantityAvailable`: una cifra de verdad.
      { sku: "TEMPO-R1-PADEL", available: 12 },
      // `availableForSale: false` es una cuenta publicada: cero de verdad.
      { sku: "GO-PICKLEBALL", available: 0 },
    ]);
  });

  it("makes no call at all for an empty batch", async () => {
    let calls = 0;
    const service = new ShopifyCommerceService({
      fetch: (request) => {
        calls += 1;
        return fixtureStorefront()(request);
      },
    });
    expect(await service.getAvailability([])).toEqual([]);
    expect(calls).toBe(0);
  });
});
