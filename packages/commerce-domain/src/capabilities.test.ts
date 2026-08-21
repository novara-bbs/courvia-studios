import { describe, expect, it } from "vitest";

import {
  CAPABILITIES_OUTSIDE_COMMERCE_SERVICE,
  CAPABILITY_IDS,
  CAPABILITY_METHODS,
  COMMERCE_SERVICE_ASSUMED_PRECISION,
  COMMERCE_SERVICE_COVERAGE,
  declaredPrecision,
  declaresCapability,
} from "./capabilities";
import type { EngineCapabilities } from "./capabilities";
import { FakeCommerceService, makeFakeCatalog } from "./fakes/fake-commerce-service";

const HOSTED: EngineCapabilities = {
  engine: "shopify",
  mode: "transactional",
  payments: "engine_hosted",
  catalogRead: true,
  availability: "boolean",
  cart: true,
  checkout: ["shopify_hosted"],
  customerOrders: false,
  returns: false,
  catalogAdmin: true,
  eventIngest: true,
};

const MARKETING: EngineCapabilities = {
  engine: "native",
  mode: "content_only",
  payments: "none",
  catalogRead: true,
  availability: "none",
  cart: false,
  checkout: [],
  customerOrders: false,
  returns: false,
  catalogAdmin: false,
  eventIngest: false,
};

describe("declaresCapability", () => {
  it("responde por lo declarado, no por el motor", () => {
    expect(declaresCapability(HOSTED, "catalog_read")).toBe(true);
    expect(declaresCapability(HOSTED, "checkout_start")).toBe(true);
    expect(declaresCapability(HOSTED, "customer_order_read")).toBe(false);
    expect(declaresCapability(HOSTED, "return_write")).toBe(false);
  });

  it("un sitio de contenido no ofrece nada transaccional", () => {
    const offered = CAPABILITY_IDS.filter((id) => declaresCapability(MARKETING, id));
    expect(offered).toEqual(["catalog_read"]);
  });
});

describe("declaredPrecision", () => {
  it("distingue «no preguntes» de «no lo sé»", () => {
    expect(declaredPrecision(HOSTED)).toBe("boolean");
    expect(declaredPrecision(MARKETING)).toBeNull();
    expect(declaredPrecision({ ...HOSTED, availability: "unknown" })).toBe("unknown");
  });
});

describe("relación con CommerceService", () => {
  it("cada método de la fachada tiene una capacidad que lo cubre", () => {
    // La tabla está tipada como Record<keyof CommerceService, …>, así que la
    // completitud la exige el compilador. Esto comprueba lo otro: que los
    // nombres son los de una implementación real y no una lista que envejece.
    const implemented = new Set(Object.getOwnPropertyNames(FakeCommerceService.prototype));
    const service = new FakeCommerceService(makeFakeCatalog());
    for (const method of Object.keys(COMMERCE_SERVICE_COVERAGE)) {
      expect(implemented.has(method), `${method} ya no existe en CommerceService`).toBe(true);
      expect(typeof (service as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("la fachada deja fuera carrito, catálogo administrable y eventos", () => {
    expect([...CAPABILITIES_OUTSIDE_COMMERCE_SERVICE]).toEqual([
      "cart_write",
      "catalog_admin",
      "event_ingest",
    ]);
  });

  it("su getAvailability solo lo puede servir quien cuenta de verdad", () => {
    // `Availability { available: number }` no tiene forma de decir "no sé":
    // por eso la fachada asume precisión exacta, y por eso un motor booleano
    // no la puede servir sin mentir.
    expect(COMMERCE_SERVICE_ASSUMED_PRECISION).toBe("exact");
  });
});

describe("CAPABILITY_METHODS", () => {
  it("cubre las ocho capacidades y no inventa una novena", () => {
    expect(Object.keys(CAPABILITY_METHODS).sort()).toEqual([...CAPABILITY_IDS].sort());
    for (const id of CAPABILITY_IDS) {
      expect(CAPABILITY_METHODS[id].length).toBeGreaterThan(0);
    }
  });
});
