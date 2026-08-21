import { describe, expect, it } from "vitest";

import {
  PRECISION_ALLOWS,
  UNKNOWN_AVAILABILITY,
  booleanAvailability,
  exactAvailability,
  exactQuantity,
  isAllowedUnder,
  lowStockRemaining,
  matchAvailability,
  stockSignal,
} from "./availability";
import type { AvailabilityView } from "./availability";

describe("exactAvailability", () => {
  it("solo acepta un entero no negativo", () => {
    expect(exactAvailability(0)).toEqual({ kind: "exact", quantity: 0 });
    expect(() => exactAvailability(-1)).toThrow(TypeError);
    expect(() => exactAvailability(1.5)).toThrow(TypeError);
    expect(() => exactAvailability(Number.MAX_SAFE_INTEGER + 2)).toThrow(TypeError);
  });
});

describe("stockSignal", () => {
  it("contesta lo mismo venga de donde venga la vista", () => {
    expect(stockSignal(exactAvailability(3))).toBe("in_stock");
    expect(stockSignal(exactAvailability(0))).toBe("out_of_stock");
    expect(stockSignal(booleanAvailability(true))).toBe("in_stock");
    expect(stockSignal(booleanAvailability(false))).toBe("out_of_stock");
    // Ni "agotado" ni "disponible": no se sabe, y la tienda puede enseñar un
    // CTA editorial en vez de inventarse un estado (ADR-029).
    expect(stockSignal(UNKNOWN_AVAILABILITY)).toBe("unknown");
  });
});

describe("lowStockRemaining", () => {
  it("solo devuelve cifra cuando alguien ha contado", () => {
    expect(lowStockRemaining(exactAvailability(1), 3)).toBe(1);
    expect(lowStockRemaining(exactAvailability(3), 3)).toBe(3);
    expect(lowStockRemaining(exactAvailability(4), 3)).toBeNull();
    expect(lowStockRemaining(exactAvailability(0), 3)).toBeNull();
  });

  it("con una vista booleana no hay «queda 1» que enseñar", () => {
    // El fallo concreto: `packages/commerce-shopify/src/mapping.ts:76`
    // convierte `availableForSale` en `1`, y ese 1 acaba en pantalla.
    expect(lowStockRemaining(booleanAvailability(true), 3)).toBeNull();
    expect(lowStockRemaining(UNKNOWN_AVAILABILITY, 3)).toBeNull();
  });

  it("rechaza un umbral que no es un entero positivo", () => {
    expect(() => lowStockRemaining(exactAvailability(1), 0)).toThrow(TypeError);
    expect(() => lowStockRemaining(exactAvailability(1), 1.5)).toThrow(TypeError);
  });
});

describe("matchAvailability", () => {
  it("pliega las tres formas", () => {
    const cases = {
      exact: (q: number) => `exact:${String(q)}`,
      boolean: (a: boolean) => `boolean:${String(a)}`,
      unknown: () => "unknown",
    };
    expect(matchAvailability(exactAvailability(2), cases)).toBe("exact:2");
    expect(matchAvailability(booleanAvailability(false), cases)).toBe("boolean:false");
    expect(matchAvailability(UNKNOWN_AVAILABILITY, cases)).toBe("unknown");
  });
});

describe("isAllowedUnder", () => {
  it("es el gemelo en runtime del tipo condicional", () => {
    // Las tres tablas tienen que decir lo mismo que `AvailabilityView<P>`,
    // porque las suites de contrato solo pueden preguntarle a esta.
    expect(PRECISION_ALLOWS.exact).toEqual(["exact", "boolean", "unknown"]);
    expect(PRECISION_ALLOWS.boolean).toEqual(["boolean", "unknown"]);
    expect(PRECISION_ALLOWS.unknown).toEqual(["unknown"]);

    const counted: AvailabilityView = exactAvailability(1);
    expect(isAllowedUnder(counted, "exact")).toBe(true);
    // Degradar está permitido —un inventario que no contesta— y subir no.
    expect(isAllowedUnder(booleanAvailability(true), "exact")).toBe(true);
    expect(isAllowedUnder(counted, "boolean")).toBe(false);
    expect(isAllowedUnder(counted, "unknown")).toBe(false);
    expect(isAllowedUnder(UNKNOWN_AVAILABILITY, "unknown")).toBe(true);
  });
});

describe("exactQuantity", () => {
  it("es el único camino a un número, y pasa por un null", () => {
    expect(exactQuantity(exactAvailability(7))).toBe(7);
    expect(exactQuantity(booleanAvailability(true))).toBeNull();
    expect(exactQuantity(UNKNOWN_AVAILABILITY)).toBeNull();
  });
});
