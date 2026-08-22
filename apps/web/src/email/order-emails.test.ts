/**
 * Los dos correos que recibe quien compró, y la frase que no es copy.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SE AFIRMA AQUÍ QUE NO ES ESTÉTICA
 * ---------------------------------------------------------------------------
 *
 * El correo de entrega lleva el plazo de desistimiento. El Art. 102 TRLGDCU
 * da 14 días **y doce meses si no se informa**, así que esa frase es lo que
 * impide que el plazo se multiplique por veintiséis. Un test que solo mirase
 * el asunto dejaría pasar la versión sin ella.
 *
 * Y se comprueba en los TRES idiomas, porque el catálogo se escribe a mano y
 * una clave presente en castellano y olvidada en árabe la caza `typecheck`
 * —parita de claves—, pero una clave presente y VACÍA, no.
 */
import { describe, expect, it } from "vitest";

import { LOCALES } from "@courvia/platform";
import type { LocaleId } from "@courvia/platform";

import { orderDeliveredEmail } from "./order-delivered";
import { emailDate, orderShippedEmail } from "./order-shipped";

const SHIPPED = {
  orderId: 4211,
  locale: "es" as LocaleId,
  lines: [
    { sku: "TEMPO-R1-P", quantity: 1 },
    { sku: "GEAR-BALLS-72", quantity: 2 },
  ],
  carrierName: "SEUR",
  trackingNumber: "SE123456789ES",
  trackingUrl: "https://seur.test/track/SE123456789ES",
  shippedAt: "2026-08-20T09:00:00.000Z",
  incoterm: "DDP",
};

const DELIVERED = {
  orderId: 4211,
  locale: "es" as LocaleId,
  market: "es" as const,
  deliveredAt: "2026-08-20T09:00:00.000Z",
  withdrawalDeadline: new Date("2026-09-03T09:00:00.000Z"),
};

describe("el correo de envío", () => {
  const message = orderShippedEmail(SHIPPED);

  it("dice quién lo lleva y con qué número, en el asunto y en el cuerpo", () => {
    expect(message.subject).toBe("Tu pedido va en camino");
    expect(message.text).toContain("SEUR");
    expect(message.text).toContain("SE123456789ES");
    expect(message.text).toContain("https://seur.test/track/SE123456789ES");
  });

  it("enumera lo que va dentro, que es lo que se comprueba al abrir la caja", () => {
    expect(message.text).toContain("TEMPO-R1-P × 1");
    expect(message.text).toContain("GEAR-BALLS-72 × 2");
  });

  it("dice que los aranceles están pagados, porque todo sale DDP (ADR-08)", () => {
    // Quien recibe un paquete de otro país espera que le pidan dinero en la
    // puerta. Decirle que no va a pasar es información con consecuencia.
    expect(message.text).toContain("aranceles");
  });

  it("un envío que NO es DDP no promete que no habrá aduana", () => {
    // El incoterm se guarda por envío: lo que dijo la etiqueta ese día, no lo
    // que dice la configuración hoy. Si algún día sale un DAP, esta promesa
    // sería falsa y cara.
    const dap = orderShippedEmail({ ...SHIPPED, incoterm: "DAP" });
    expect(dap.text).not.toContain("aranceles");
  });

  it("un transportista sin plantilla de seguimiento no deja un enlace a medias", () => {
    // `buildTrackingUrl` devuelve cadena vacía cuando la fila de `carriers`
    // no tiene plantilla. «Sigue el envío aquí: » con un hueco detrás parece
    // un enlace roto nuestro.
    const sinUrl = orderShippedEmail({ ...SHIPPED, trackingUrl: "" });
    expect(sinUrl.text).not.toContain("Sigue el envío aquí:");
    expect(sinUrl.text).toContain("responde a este correo");
    expect(sinUrl.text).toContain("SE123456789ES");
  });

  it("un pedido sin líneas no imprime una lista vacía", () => {
    const sinLineas = orderShippedEmail({ ...SHIPPED, lines: [] });
    expect(sinLineas.text).not.toContain("Qué va dentro");
    // Pero sí sigue diciendo lo esencial: quién lo lleva.
    expect(sinLineas.text).toContain("SEUR");
  });
});

describe("el correo de entrega", () => {
  const message = orderDeliveredEmail(DELIVERED);

  it("lleva el plazo de desistimiento con FECHA, que es lo que exige informar", () => {
    expect(message.text).toContain("desistir");
    // La fecha, no «catorce días»: un plazo relativo obliga a quien lo lee a
    // recordar cuándo llegó la caja.
    expect(message.text).toContain(emailDate("2026-09-03T09:00:00.000Z", "es"));
  });

  it("un mercado sin plazo legal uniforme NO calla: remite al contrato", () => {
    // EAU. Callar sobre devoluciones porque la ley local no impone un número
    // dejaría a quien compró sin saber qué hacer con una caja que no quiere.
    const eau = orderDeliveredEmail({ ...DELIVERED, market: "ae", withdrawalDeadline: null });
    expect(eau.text).toContain("contrato de compra");
    expect(eau.text).not.toContain("desistir de la compra y devolverla");
  });

  it("da instrucciones, no promesas", () => {
    // `.claude/rules/content-voice.md`: si no se mide, no se afirma. Las dos
    // líneas de la primera sesión dicen qué hacer, no qué va a pasar.
    expect(message.text).toContain("Calíbralo para tu pista y tu bola");
    expect(message.text).not.toMatch(/mejorar[áé]s|garantiz|revolucionari|incre[íi]ble/iu);
  });

  it("manda escribir antes de devolver, que es lo que arregla la mayoría", () => {
    expect(message.text).toContain("antes de devolver nada");
  });
});

describe("los tres idiomas dicen lo mismo, y ninguno se queda a medias", () => {
  for (const locale of LOCALES) {
    it(`${locale}: ninguna clave se queda sin traducir ni sin sustituir`, () => {
      const shipped = orderShippedEmail({ ...SHIPPED, locale });
      const delivered = orderDeliveredEmail({ ...DELIVERED, locale });

      for (const message of [shipped, delivered]) {
        // Un hueco sin sustituir (`{trackingNumber}`) es el fallo típico de
        // añadir una clave a un catálogo y olvidar el parámetro en otro.
        expect(message.text, "quedó un hueco sin sustituir").not.toMatch(/\{[a-zA-Z]+\}/u);
        // Y una clave que falta se renderiza como su propia ruta.
        expect(message.text).not.toContain("orderShipped.");
        expect(message.text).not.toContain("orderDelivered.");
        expect(message.subject.trim().length).toBeGreaterThan(0);
      }

      // El dato duro viaja igual en los tres: un número de seguimiento no se
      // traduce, y el plazo tiene que estar en todos.
      expect(shipped.text).toContain("SE123456789ES");
      expect(delivered.text).toContain(emailDate("2026-09-03T09:00:00.000Z", locale));
    });
  }

  it("ninguno lleva emoji, que es el tic más rápido de detectar", () => {
    // `.claude/rules/content-voice.md`: nunca, ni en la interfaz ni en
    // titulares. La telemetría es la firma visual, no los emojis.
    for (const locale of LOCALES) {
      const both =
        orderShippedEmail({ ...SHIPPED, locale }).text +
        orderDeliveredEmail({ ...DELIVERED, locale }).text;
      expect(both, `${locale} lleva emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("la fecha", () => {
  it("se escribe en el idioma de quien lee", () => {
    expect(emailDate("2026-09-03T09:00:00.000Z", "es")).toContain("septiembre");
    expect(emailDate("2026-09-03T09:00:00.000Z", "en")).toContain("September");
  });

  it("va en UTC, no en la zona del servidor que despacha el cron", () => {
    // A las 23:30 UTC del día 3, la zona de Madrid ya es día 4. El correo lo
    // manda un cron cuya zona no es la de nadie: fijar UTC hace que la fecha
    // no dependa de a qué hora se despachó la fila.
    expect(emailDate("2026-09-03T23:30:00.000Z", "es")).toContain("3");
  });

  it("una fecha inservible se devuelve tal cual en vez de «Invalid Date»", () => {
    expect(emailDate("no es una fecha", "es")).toBe("no es una fecha");
  });
});
