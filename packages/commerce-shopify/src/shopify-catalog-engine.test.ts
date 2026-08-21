/**
 * The capability claim, executable (ADR-029).
 *
 * Three suites run here and only three, because three capabilities are
 * declared. That correspondence is not decoration: running
 * `describeCartContract` against an engine that never declared `cart` would
 * be testing a promise nobody made, and NOT running the suites for what IS
 * declared is how `commerce-shopify` came to hold three methods that throw.
 *
 * Both precisions run the same suites. The Storefront API publishes
 * `quantityAvailable` when the shop opts in and not otherwise, so precision
 * is a fact of the connection, and a study that only exercised one of them
 * would leave the other unproven.
 */
import {
  CAPABILITY_IDS,
  CAPABILITY_METHODS,
  booleanAvailability,
  declaredPrecision,
  declaresCapability,
  exactAvailability,
  exactQuantity,
  lowStockRemaining,
  stockSignal,
} from "@courvia/commerce-domain";
import type { AvailabilityPrecision, CommerceOwner } from "@courvia/commerce-domain";
import {
  describeAvailabilityContract,
  describeCatalogReadContract,
  describeEngineCapabilitiesContract,
} from "@courvia/commerce-domain/testing";
import { describe, expect, it } from "vitest";

import { fixtureStorefront } from "./fixture-shop";
import { toAvailabilityView } from "./mapping";
import { ShopifyCatalogEngine } from "./shopify-catalog-engine";
import { ShopifyCommerceService } from "./shopify-commerce-service";
import type { ShopifyVariant } from "./storefront";

const OWNER: CommerceOwner<"shopify"> = {
  siteKey: "courvia",
  engine: "shopify",
  connectionKey: "fixture-shop",
  bindingRevision: 1,
};

const make = <P extends AvailabilityPrecision>(
  availabilityPrecision: P,
): ShopifyCatalogEngine<P> =>
  new ShopifyCatalogEngine({
    owner: OWNER,
    fetch: fixtureStorefront(),
    availabilityPrecision,
  });

/** A variant with no published count: Shopify's default answer. */
const uncounted: ShopifyVariant = {
  id: "gid://shopify/ProductVariant/99",
  sku: "UNCOUNTED",
  title: "Sin inventario publicado",
  price: { amount: "10.00", currencyCode: "EUR" },
  availableForSale: true,
};

/** A variant from a shop that publishes inventory to the Storefront API. */
const counted: ShopifyVariant = { ...uncounted, sku: "COUNTED", quantityAvailable: 7 };

/* --------------------------------------------------- las tres suites, x2 */

for (const precision of ["boolean", "exact"] as const) {
  describeEngineCapabilitiesContract(`commerce-shopify · ${precision}`, () => make(precision));

  describeCatalogReadContract(`commerce-shopify · ${precision}`, () => make(precision), {
    knownSlug: "tempo-r1",
    unknownSlug: "no-such-robot",
    market: "es",
    otherMarket: "uk",
    precision,
  });

  describeAvailabilityContract(`commerce-shopify · ${precision}`, () => make(precision), {
    knownSku: "TEMPO-R1-PADEL",
    unknownSku: "NOPE-000",
  });
}

/* ------------------------------------------- lo que NO declara ni implementa */

describe("una capacidad ausente no se implementa lanzando", () => {
  const DECLARED = ["catalog_read", "availability_read"];

  it("declara leer catálogo y disponibilidad, y nada más", () => {
    const engine = make("boolean");
    const declared = CAPABILITY_IDS.filter((id) => declaresCapability(engine.capabilities, id));
    expect([...declared]).toEqual(DECLARED);
  });

  it("no expone un solo método de las capacidades que no declara", () => {
    // La otra mitad de la aserción del contrato, escrita aquí porque es el
    // punto entero del troceo: `createCheckout`, `getOrder` y `requestReturn`
    // del estudio de ADR-024 no se convierten en métodos que lanzan, se
    // convierten en métodos que NO EXISTEN.
    const engine: Record<string, unknown> = make("boolean") as unknown as Record<string, unknown>;
    const absent = CAPABILITY_IDS.filter((id) => !DECLARED.includes(id)).flatMap(
      (id) => CAPABILITY_METHODS[id],
    );
    expect(absent).toContain("startCheckout");
    expect(absent).toContain("getOrder");
    expect(absent).toContain("requestReturn");
    for (const method of absent) {
      expect(typeof engine[method], `${method}() no debe existir aquí`).toBe("undefined");
    }
  });

  it("no implementa PaymentProvider, ni un método suyo (ADR-029)", () => {
    // El contrato solo lo comprueba cuando `payments === "engine_hosted"`, y
    // este estudio declara `"none"`. La prohibición vale igual: cuando un
    // motor externo está activo, él controla checkout y pagos, y el puerto de
    // pagos es exclusivo del nativo.
    const engine: Record<string, unknown> = make("boolean") as unknown as Record<string, unknown>;
    for (const method of ["createSession", "refund", "verifyWebhook", "normalizeEvent"]) {
      expect(typeof engine[method], `${method}() pertenece al motor nativo`).toBe("undefined");
    }
    expect(engine.id, "un PaymentProviderId aquí sería el primer paso").toBeUndefined();
  });

  it("no finge comercio: sin carrito, sin traspaso, sin pedidos, sin devoluciones", () => {
    const { capabilities } = make("boolean");
    expect(capabilities.mode).toBe("content_only");
    expect(capabilities.payments).toBe("none");
    expect(capabilities.cart).toBe(false);
    expect(capabilities.checkout).toEqual([]);
    expect(capabilities.customerOrders).toBe(false);
    expect(capabilities.returns).toBe(false);
  });
});

/* ------------------------------------------------ el invariante 16, de cerca */

describe("disponibilidad: la conexión declara, el mapeo obedece", () => {
  it("declara la precisión con la que se construyó", () => {
    expect(declaredPrecision(make("exact").capabilities)).toBe("exact");
    expect(declaredPrecision(make("boolean").capabilities)).toBe("boolean");
    expect(make("boolean").availabilityPrecision).toBe("boolean");
  });

  it("con quantityAvailable presente y conexión exacta, cuenta de verdad", () => {
    expect(toAvailabilityView(counted, "exact")).toEqual(exactAvailability(7));
  });

  it("SIN quantityAvailable no inventa una cantidad, ni en una conexión exacta", () => {
    // Aquí vivía `availableForSale ? 1 : 0`. Un `exactAvailability(1)` en esta
    // línea pasaría `isAllowedUnder` —la precisión declarada lo permite— y
    // acabaría en pantalla como «queda 1». Por eso la aserción es sobre la
    // FORMA de la vista, no sobre si la precisión la tolera.
    const view = toAvailabilityView(uncounted, "exact");
    expect(view).toEqual(booleanAvailability(true));
    expect(exactQuantity(view)).toBeNull();
    expect(lowStockRemaining(view, 3)).toBeNull();
    expect(stockSignal(view)).toBe("in_stock");
    expect(toAvailabilityView({ ...uncounted, availableForSale: false }, "exact")).toEqual(
      booleanAvailability(false),
    );
  });

  it("una conexión booleana no sube a exacta aunque la tienda publique la cantidad", () => {
    // La precisión es un techo, no una promesa (`availability.ts`). Declarar
    // booleano y devolver 7 sería mentir en la otra dirección.
    const view = toAvailabilityView(counted, "boolean");
    expect(view).toEqual(booleanAvailability(true));
    expect(exactQuantity(view)).toBeNull();
  });

  it("un SKU que la tienda no conoce es «no se sabe», nunca «agotado»", async () => {
    expect(toAvailabilityView(undefined, "exact")).toEqual({ kind: "unknown" });
    const answers = await make("exact").getAvailability(["NOPE-000", "TEMPO-R1-PADEL"]);
    expect(answers.map((answer) => stockSignal(answer.view))).toEqual(["unknown", "in_stock"]);
    expect(answers.map((answer) => exactQuantity(answer.view))).toEqual([null, 12]);
  });

  it("la misma tienda, dos conexiones, dos respuestas honestas", async () => {
    // TEMPO-R1-PADEL publica cantidad (12); TEMPO-R1-TENNIS no. Una conexión
    // exacta cuenta la primera y degrada en la segunda; una booleana no
    // cuenta ninguna. Ni una sola cifra inventada en las cuatro respuestas.
    const skus = ["TEMPO-R1-PADEL", "TEMPO-R1-TENNIS"];
    const exact = await make("exact").getAvailability(skus);
    const boolean = await make("boolean").getAvailability(skus);
    expect(exact.map((answer) => answer.view)).toEqual([
      exactAvailability(12),
      booleanAvailability(true),
    ]);
    expect(boolean.map((answer) => answer.view)).toEqual([
      booleanAvailability(true),
      booleanAvailability(true),
    ]);
  });

  it("la PDP recibe la misma disciplina que el lote", async () => {
    const view = await make("boolean").getProduct("tempo-r1", "es");
    expect(view?.variants.map((variant) => exactQuantity(variant.availability))).toEqual([
      null,
      null,
    ]);
    const exact = await make("exact").getProduct("tempo-r1", "es");
    expect(exact?.variants.map((variant) => exactQuantity(variant.availability))).toEqual([12, null]);
  });
});

/* ------------------------------------------------------ referencias y dueño */

describe("todo lo que sale lleva la conexión de la que salió", () => {
  it("las referencias son GIDs de Shopify atados a esta conexión", async () => {
    const view = await make("boolean").getProduct("tempo-r1", "es");
    expect(view?.ref).toEqual({
      kind: "product",
      engine: "shopify",
      connectionKey: "fixture-shop",
      externalId: "gid://shopify/Product/1",
    });
    expect(view?.variants[0]?.ref.kind).toBe("variant");
    expect(view?.variants[0]?.ref.externalId).toBe("gid://shopify/ProductVariant/11");
  });

  it("otra conexión sobre la misma tienda produce otras referencias", async () => {
    // Invariante 1: dos conexiones al mismo Shopify son dos negocios, y sus
    // referencias no se pueden confundir aunque el GID coincida.
    const other = new ShopifyCatalogEngine({
      owner: { ...OWNER, connectionKey: "otra-tienda" },
      fetch: fixtureStorefront(),
      availabilityPrecision: "boolean",
    });
    const mine = await make("boolean").getProduct("tempo-r1", "es");
    const theirs = await other.getProduct("tempo-r1", "es");
    expect(theirs?.ref.externalId).toBe(mine?.ref.externalId);
    expect(theirs?.ref.connectionKey).not.toBe(mine?.ref.connectionKey);
  });
});

/* --------------------------------------------------- la fachada, sin tocarla */

describe("la fachada de ADR-024 sigue en pie y de acuerdo", () => {
  it("lista lo mismo que el motor, filtro a filtro", () => {
    // `ShopifyCommerceService` conserva su propia copia del filtrado —es un
    // estudio congelado y no se toca—, así que esto es lo que impide que las
    // dos copias se separen sin que nadie se entere.
    const engine = make("boolean");
    const facade = new ShopifyCommerceService({ fetch: fixtureStorefront() });
    const filters = [
      { market: "es" as const },
      { market: "es" as const, limit: 1 },
      { market: "uk" as const, sport: "pickleball" as const },
      { market: "es" as const, slugs: ["tempo-r1"] },
      { market: "es" as const, offset: 1 },
    ];
    return Promise.all(
      filters.map(async (filter) => {
        const [listings, summaries] = await Promise.all([
          engine.listProducts(filter),
          facade.listProducts(filter),
        ]);
        expect(listings.map((listing) => listing.slug)).toEqual(
          summaries.map((summary) => summary.slug),
        );
        expect(listings.map((listing) => listing.fromPrice)).toEqual(
          summaries.map((summary) => summary.fromPrice),
        );
      }),
    );
  });
});
