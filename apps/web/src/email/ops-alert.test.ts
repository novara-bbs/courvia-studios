/**
 * El correo que lee quien opera la tienda.
 *
 * Lo que se afirma aquí es lo que hace útil una alerta a las tres de la
 * mañana: que el asunto se pueda triar sin abrirlo, que el detalle que la
 * fila guardó llegue ENTERO, y que haya un enlace al sitio donde se resuelve.
 */
import { describe, expect, it } from "vitest";

import { opsAlertEmail } from "./ops-alert";

const BASE = {
  effect: "alert_payment_conflict",
  orderId: 4211,
  origin: "https://courvia.test",
  outboxId: 77,
};

describe("la alerta de operaciones", () => {
  it("se tría por el asunto: el efecto primero, el pedido después", () => {
    const message = opsAlertEmail({ ...BASE, detail: {} });
    expect(message.subject).toBe("[Courvia] alert_payment_conflict · pedido 4211");
  });

  it("lleva TODO lo que la fila guardó, no una selección", () => {
    /*
     * El payload lo escribe el aplicador de pagos, y quien lea esto dentro de
     * seis meses puede necesitar un campo que hoy nadie mira. Filtrar por lo
     * que parece importante ahora es decidir por él.
     */
    const message = opsAlertEmail({
      ...BASE,
      detail: {
        reason: "amount_mismatch",
        eventType: "paid",
        providerEventId: "evt_123",
        amountMinor: 129_000,
        currency: "EUR",
      },
    });
    for (const fragment of [
      "reason: amount_mismatch",
      "eventType: paid",
      "providerEventId: evt_123",
      "amountMinor: 129000",
      "currency: EUR",
    ]) {
      expect(message.text, `falta «${fragment}»`).toContain(fragment);
    }
  });

  it("lleva al pedido, no a una búsqueda", () => {
    const message = opsAlertEmail({ ...BASE, detail: {} });
    expect(message.text).toContain("https://courvia.test/admin/collections/orders/4211");
  });

  it("sin pedido, lleva a la fila — y lo dice en el asunto", () => {
    // Un `null` aquí ya es información: significa que la alerta no pudo
    // atarse a un pedido, y quien la reciba tiene que saberlo antes de
    // buscarlo.
    const message = opsAlertEmail({ ...BASE, orderId: null, detail: {} });
    expect(message.subject).toContain("sin pedido asociado");
    expect(message.text).toContain("/admin/collections/outbox/77");
  });

  it("dice que la fila no se reintenta sola", () => {
    // Es lo que distingue esta alerta de un fallo transitorio: nadie tiene
    // que esperar a que se arregle sola, porque no va a pasar.
    expect(opsAlertEmail({ ...BASE, detail: {} }).text).toContain("NO se reintenta sola");
  });

  it("una fila sin detalle lo dice, en vez de dejar un hueco", () => {
    expect(opsAlertEmail({ ...BASE, detail: null }).text).toContain("no guardó detalle");
  });
});
