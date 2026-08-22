/**
 * La orden de trabajo, y sobre todo la contraorden.
 *
 * Lo que se afirma aquí no es formato: es que las dos no se confundan. Una
 * contraorden que se lee como una orden de preparación manda un robot cuyo
 * dinero ya va de vuelta, y eso no lo reclama nadie hasta que falta el robot.
 */
import { describe, expect, it } from "vitest";

import { opsWorkOrderEmail } from "./ops-work-order";

const BASE = {
  orderId: 4211,
  market: "es",
  origin: "https://courvia.test",
  outboxId: 77,
  lines: [
    { sku: "TEMPO-R1-P", quantity: 1 },
    { sku: "GEAR-BALLS-72", quantity: 2 },
  ],
} as const;

describe("la orden de preparación", () => {
  const message = opsWorkOrderEmail({ ...BASE, effect: "start_picking" });

  it("dice qué pedido y de qué mercado sin abrirlo", () => {
    expect(message.subject).toBe("[Courvia] Preparar pedido 4211 · ES");
  });

  it("lleva las unidades que hay que coger, no un enlace a buscarlas", () => {
    expect(message.text).toContain("TEMPO-R1-P × 1");
    expect(message.text).toContain("GEAR-BALLS-72 × 2");
    expect(message.text).toContain("Unidades: 3");
  });

  it("dice dónde se marca enviado, que es el único sitio que mueve el estado", () => {
    // `orders.status` es de solo lectura: quien prepara no puede cambiarlo, y
    // si el correo no lo dice acabará pidiéndoselo a alguien por chat.
    expect(message.text).toContain("crea el envío en el panel");
    expect(message.text).toContain("https://courvia.test/admin/collections/orders/4211");
  });

  it("no lleva la dirección de nadie", () => {
    // La etiqueta la necesita; una bandeja de entrada, no. El enlace al panel
    // la tiene a un clic con la sesión que corresponda.
    expect(message.text).not.toMatch(/calle|street|postal|C\.?P\.?/iu);
  });
});

describe("la contraorden", () => {
  const message = opsWorkOrderEmail({ ...BASE, effect: "stop_picking" });

  it("empieza por NO ENVIAR, que es lo que se lee en la lista", () => {
    expect(message.subject).toBe("[Courvia] NO ENVIAR · pedido 4211 · ES");
    // Y no empieza por «Preparar»: son dos correos sobre el mismo pedido, y
    // el segundo tiene que ganar de un vistazo.
    expect(message.subject.startsWith("[Courvia] NO ENVIAR")).toBe(true);
  });

  it("no se puede confundir con la orden: dice lo contrario en la primera línea", () => {
    const first = message.text.split("\n")[0] ?? "";
    expect(first).toContain("NO se envía");
    expect(first).not.toContain("Orden de preparación");
  });

  it("dice qué hacer si el paquete ya salió, que es el caso caro", () => {
    expect(message.text).toContain("ya ha salido");
    expect(message.text).toContain("devuelve las unidades al");
  });

  it("las dos versiones hablan del MISMO pedido y del mismo enlace", () => {
    // Comparten pedido, mercado y destino en el panel: lo único que cambia
    // es la instrucción. Si divergieran, quien las lea tendría que decidir
    // cuál de las dos se refiere a su caja.
    const start = opsWorkOrderEmail({ ...BASE, effect: "start_picking" });
    for (const fragment of ["Pedido: 4211", "Mercado: ES", "/admin/collections/orders/4211"]) {
      expect(start.text, `la orden perdió «${fragment}»`).toContain(fragment);
      expect(message.text, `la contraorden perdió «${fragment}»`).toContain(fragment);
    }
  });
});

describe("los casos que no deberían pasar y pasan", () => {
  it("un pedido sin líneas lo DICE, en vez de dejar un hueco silencioso", () => {
    // Cero líneas en una orden de preparación es un pedido roto, no un
    // pedido vacío. Un hueco en blanco se lee como «no hay nada que coger».
    const message = opsWorkOrderEmail({ ...BASE, effect: "start_picking", lines: [] });
    expect(message.text).toContain("no tiene líneas");
    expect(message.text).toContain("Unidades: 0");
  });
});
