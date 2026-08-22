/**
 * The JSON-LD block is what every crawler, shopping feed and AI assistant
 * reads instead of the page, so a wrong number here is wrong everywhere at
 * once and nobody sees it in a browser.
 *
 * This suite exists because the price used to be `(amount / 100).toFixed(2)`
 * — two hardcoded assumptions that every currency has exactly two minor
 * units — and nothing caught it. It could not have caught it either: until
 * `oxc.jsx` was configured in vitest.config.ts, importing any `.tsx` in this
 * app failed at parse time, so no component here was testable at all.
 */
import { money } from "@courvia/commerce-domain";
import type { ProductDetail } from "@courvia/commerce-domain";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductJsonLd } from "./product-json-ld";

function detail(overrides: {
  launchStatus?: ProductDetail["product"]["launchStatus"];
  price?: ReturnType<typeof money> | null;
  available?: number | null;
}): ProductDetail {
  const price = overrides.price === undefined ? money(129000, "EUR") : overrides.price;
  return {
    product: {
      id: "1",
      slug: "tempo-r1",
      title: "Tempo R1",
      sports: ["padel"],
      specs: [],
      variantIds: ["v1"],
      ...(overrides.launchStatus === undefined ? {} : { launchStatus: overrides.launchStatus }),
    },
    variants: [
      {
        id: "v1",
        productId: "1",
        sku: "TEMPO-R1-PADEL",
        sport: "padel",
        attributes: {},
        price,
        available: overrides.available === undefined ? 3 : overrides.available,
      },
    ],
  };
}

/** The `<script type="application/ld+json">` payload, parsed. */
function emitted(product: ProductDetail): Record<string, unknown> {
  const html = renderToStaticMarkup(<ProductJsonLd detail={product} region="es" />);
  const body = html.replace(/^.*?>/s, "").replace(/<\/script>$/, "");
  return JSON.parse(
    body.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">"),
  ) as Record<string, unknown>;
}

describe("price is scaled by the currency, not by a literal 100", () => {
  it("emits a two-decimal string for a two-decimal currency", () => {
    const offers = emitted(detail({})).offers as Array<{ price: string; priceCurrency: string }>;
    expect(offers[0]?.price).toBe("1290.00");
    expect(offers[0]?.priceCurrency).toBe("EUR");
  });

  it("keeps the cents that float division loses", () => {
    // (89050 / 100).toFixed(2) is the classic near-miss; assert the exact
    // string rather than a number so a rounding regression cannot hide.
    const offers = emitted(detail({ price: money(89050, "EUR") })).offers as Array<{
      price: string;
    }>;
    expect(offers[0]?.price).toBe("890.50");
  });
});

describe("launch status decides what may be published at all", () => {
  it("emits NO offers for a waitlist product", () => {
    // ADR-022: a waitlist price is staging data, not an offer to sell.
    // The key is absent rather than an empty array on purpose: `offers: []`
    // is a Product that declares it has offers and then lists none, which
    // Google reports as an invalid item instead of as an unpriced product.
    expect(emitted(detail({ launchStatus: "waitlist" }))).not.toHaveProperty("offers");
  });

  it("marks a preorder as PreOrder rather than guessing from stock", () => {
    const offers = emitted(detail({ launchStatus: "preorder", available: 0 })).offers as Array<{
      availability: string;
    }>;
    expect(offers[0]?.availability).toBe("https://schema.org/PreOrder");
  });

  it("reports OutOfStock when an available product has none", () => {
    const offers = emitted(detail({ available: 0 })).offers as Array<{ availability: string }>;
    expect(offers[0]?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("does not publish OutOfStock for stock nobody counts", () => {
    /*
     * `available: null` es stock NO CONTROLADO —accesorios, consumibles, todo
     * lo que se repone sin llevar la cuenta— y hasta ahora un `?? 0` en el
     * adaptador lo convertía en cero. Cero aquí es `OutOfStock`, y
     * `OutOfStock` es lo que leen Google Shopping, cada comparador de precios
     * y cada asistente que responde por nosotros: «no lo tienen». Sobre algo
     * que sí se vende.
     *
     * Nadie lo habría visto en un navegador, que es exactamente el motivo por
     * el que esta suite existe.
     */
    const offers = emitted(detail({ available: null })).offers as Array<{ availability: string }>;
    expect(offers[0]?.availability).toBe("https://schema.org/InStock");
  });

  it("skips a variant with no price in this market", () => {
    // A market with no `Price` row for the SKU is not a free product.
    expect(emitted(detail({ price: null }))).not.toHaveProperty("offers");
  });
});
