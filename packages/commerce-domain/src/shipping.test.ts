/**
 * Las cuatro respuestas de una tarifa, y la que no es cero.
 */
import { describe, expect, it } from "vitest";

import { money, zero } from "./money";
import { amountToFreeShipping, quoteShipping } from "./shipping";
import type { ShippingRates } from "./shipping";

const RATES: ShippingRates = {
  es: { flatAmount: 990, freeOver: 10_000 },
  uk: { flatAmount: 0 },
  // `ae` a propósito sin configurar.
};

describe("quoteShipping", () => {
  it("cobra la tarifa plana por debajo del umbral", () => {
    const quote = quoteShipping("es", money(5_000, "EUR"), RATES, "EUR");
    expect(quote).toEqual({ amount: money(990, "EUR"), reason: "flat" });
  });

  it("el umbral se cumple EN el umbral, no a partir del céntimo siguiente", () => {
    // «Gratis a partir de 100 €» tiene que ser gratis con 100,00 € exactos:
    // es lo que entiende quien lo lee, y un `>` en vez de un `>=` convierte
    // la promesa en una trampa de un céntimo.
    expect(quoteShipping("es", money(10_000, "EUR"), RATES, "EUR").reason).toBe("free_threshold");
    expect(quoteShipping("es", money(9_999, "EUR"), RATES, "EUR").reason).toBe("flat");
  });

  it("un mercado que no cobra envío lo dice, y no parece un umbral cumplido", () => {
    const quote = quoteShipping("uk", money(1, "GBP"), RATES, "GBP");
    expect(quote).toEqual({ amount: zero("GBP"), reason: "free_always" });
  });

  it("un mercado SIN tarifa contesta «no se sabe», no cero", () => {
    /*
     * La misma distinción que `Availability.available`: un `?? 0` convierte
     * «nadie lo ha configurado» en «es gratis», y eso es regalar el porte de
     * cada pedido de ese mercado hasta que alguien lo note. El importe
     * acompaña en cero porque `Money` no admite ausencia, pero el motivo es
     * lo que se consulta — y `createCheckout` lo rechaza.
     */
    const quote = quoteShipping("ae", money(50_000, "AED"), RATES, "AED");
    expect(quote.reason).toBe("unconfigured");
  });

  it("no convierte moneda: el importe sale en la del mercado", () => {
    // ADR-05. Un envío en euros sobre un pedido en dirhams no existe.
    expect(quoteShipping("es", money(1_000, "EUR"), RATES, "EUR").amount.currency).toBe("EUR");
  });
});

describe("amountToFreeShipping", () => {
  it("dice cuánto falta mientras falte", () => {
    expect(amountToFreeShipping("es", money(6_000, "EUR"), RATES, "EUR")).toEqual(
      money(4_000, "EUR"),
    );
  });

  it("calla cuando ya está cumplido", () => {
    expect(amountToFreeShipping("es", money(10_000, "EUR"), RATES, "EUR")).toBeNull();
  });

  it("calla donde no hay umbral que prometer", () => {
    expect(amountToFreeShipping("uk", money(1, "GBP"), RATES, "GBP")).toBeNull();
    expect(amountToFreeShipping("ae", money(1, "AED"), RATES, "AED")).toBeNull();
  });
});
