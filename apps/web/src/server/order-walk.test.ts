/**
 * El recorrido entero, y esta vez los efectos OCURREN.
 *
 * ---------------------------------------------------------------------------
 * LA PIEZA QUE FALTABA
 * ---------------------------------------------------------------------------
 *
 * `orders-fulfilment.test.ts` prueba que cada paso encola la fila correcta con
 * el payload correcto. `e2e/order-walk.spec.ts` prueba que una persona con
 * sesión puede darlos por HTTP y que la API le niega lo que tiene que negarle.
 * Ninguno de los dos DESPACHA nada: hasta aquí, «el correo de seguimiento se
 * encoló» era todo lo que este repo sabía decir.
 *
 * Esto engancha las tres capas de una vez: la máquina de estados escribe el
 * payload, el despachador reclama la fila, y el handler compone el mensaje con
 * lo que la máquina guardó. Es donde se ve si el payload que una escribe es el
 * que la otra espera — un `carrierName` que la máquina llama `carrier` sale
 * aquí como un correo sin transportista, y en ninguna de las otras dos suites.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL PLAZO SE COMPRUEBA EN LOS DOS SITIOS
 * ---------------------------------------------------------------------------
 *
 * La entrega encola DOS filas: `open_withdrawal_window`, que escribe la fecha
 * en el pedido, y `send_post_sale_email`, que se la dice a quien compró. Nada
 * ordena cuál se despacha antes, así que el correo la recalcula en vez de
 * leerla. Que las dos coincidan es lo que hace que esa duplicación sea segura,
 * y por eso se afirma que coinciden en vez de darlo por hecho.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dispatchOutbox } from "./outbox";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

const FIXTURE_SLUG = "walk-fixture";
const FIXTURE_SKU = "WALK-TEST";
const CARRIER_CODE = "walk-courier";
const TRACKING = "WALK-TRK-0001";
const DELIVERED_AT = "2026-08-25T09:00:00.000Z";
const OPS = "almacen@courvia.test";
const BUYER = "recorrido@courvia.test";

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

type Payload = Awaited<ReturnType<typeof loadPayload>>;

describeDb("de pagado a entregado, con los efectos despachados", () => {
  let payload: Payload;
  let productId: number;
  let variantId: number;
  let carrierId: number;
  let orderId: number;
  let shipmentId: number;
  let previousOps: string | undefined;
  /** Todo lo que salió por `sendEmail` durante el recorrido. */
  let sent: { to: unknown; subject: unknown; text: unknown }[] = [];

  async function firstId(collection: string, where: object): Promise<number | null> {
    const found = (await payload.find({
      collection: collection as never,
      where: where as never,
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })) as unknown as { docs: { id: number }[] };
    return found.docs.length > 0 ? Number(found.docs[0]?.id) : null;
  }

  /**
   * El correo de ESTE recorrido.
   *
   * Filtra por destinatario a propósito: el despachador reclama TODA la cola
   * pendiente de la base de datos, así que sin este filtro un `find` por
   * asunto devuelve el correo de otro fixture —pasó: el del escenario del
   * navegador, que también acaba entregado— y el test afirmaría sobre un
   * pedido que no es el suyo.
   */
  function mailTo(recipient: string, fragment: string) {
    return sent.find(
      (message) => String(message.to) === recipient && String(message.subject).includes(fragment),
    );
  }

  /** Las de operaciones van todas a la misma dirección: se distinguen por el id. */
  function opsMail(fragment: string) {
    return sent.find(
      (message) =>
        String(message.to) === OPS &&
        String(message.subject).includes(fragment) &&
        String(message.subject).includes(String(orderId)),
    );
  }

  beforeAll(async () => {
    previousOps = process.env.OPS_EMAIL;
    process.env.OPS_EMAIL = OPS;
    payload = await loadPayload();

    productId =
      (await firstId("products", { slug: { equals: FIXTURE_SLUG } })) ??
      Number(
        (
          await payload.create({
            collection: "products",
            locale: "es",
            draft: false,
            overrideAccess: true,
            data: {
              title: "Banco de pruebas del recorrido despachado",
              slug: FIXTURE_SLUG,
              sports: ["padel"],
              excerpt: "Fixture del recorrido. No es un producto.",
              specs: [],
              launchStatus: "available",
              // BORRADOR, y es importante: un producto publicado sale en /{región}/robots
              // como cualquier otro. Uno de estos fixtures llegó a la portada de
              // catálogo y tumbó `chrome-shell.test.ts` con «a card image with no alt».
              _status: "draft",
            },
          })
        ).id,
      );

    variantId =
      (await firstId("variants", { sku: { equals: FIXTURE_SKU } })) ??
      Number(
        (
          await payload.create({
            collection: "variants",
            overrideAccess: true,
            data: {
              product: productId,
              sku: FIXTURE_SKU,
              sport: "padel",
              active: true,
            },
          })
        ).id,
      );

    carrierId =
      (await firstId("carriers", { code: { equals: CARRIER_CODE } })) ??
      Number(
        (
          await payload.create({
            collection: "carriers",
            overrideAccess: true,
            data: {
              code: CARRIER_CODE,
              name: "Courier del recorrido",
              trackingUrlTemplate: "https://walk.test/track/{tracking}",
              markets: ["es"],
              active: true,
            } as never,
          })
        ).id,
      );

    orderId = Number(
      (
        await payload.create({
          collection: "orders",
          overrideAccess: true,
          data: {
            status: "paid",
            market: "es",
            email: BUYER,
            locale: "es",
            lines: [
              {
                variant: variantId,
                sku: FIXTURE_SKU,
                quantity: 1,
                unitAmount: 129_000,
              },
            ],
            totalAmount: 129_000,
            taxAmount: 0,
            shippingAmount: 0,
            refundedAmount: 0,
            shippingAddress: {
              name: "Compradora",
              line1: "Calle Uno 1",
              city: "Madrid",
              postalCode: "28001",
              country: "ES",
            },
          },
        })
      ).id,
    );

    // ------------------------------------------------- el recorrido completo
    // Por la colección de envíos, que es la superficie de verdad (ADR-027).
    shipmentId = Number(
      (
        await payload.create({
          collection: "shipments",
          overrideAccess: true,
          data: { order: orderId },
        })
      ).id,
    );
    await payload.update({
      collection: "shipments",
      id: shipmentId,
      overrideAccess: true,
      data: { carrier: carrierId, trackingNumber: TRACKING },
    });
    await payload.update({
      collection: "shipments",
      id: shipmentId,
      overrideAccess: true,
      data: { deliveredAt: DELIVERED_AT },
    });

    // ------------------------------------------------------- y el despacho
    const spy = vi
      .spyOn(payload, "sendEmail")
      .mockImplementation((message: Parameters<typeof payload.sendEmail>[0]) => {
        sent.push({
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return Promise.resolve(undefined as unknown as ReturnType<typeof payload.sendEmail>);
      });
    try {
      const { outboxHandlers } = await import("./outbox-handlers");
      // Varias vueltas: un tick tiene presupuesto y límite de página, y este
      // pedido comparte cola con lo que hayan dejado otras suites.
      for (let tick = 0; tick < 4; tick += 1) {
        await dispatchOutbox(payload, { handlers: outboxHandlers() });
      }
    } finally {
      spy.mockRestore();
    }
  });

  afterAll(async () => {
    if (previousOps === undefined) delete process.env.OPS_EMAIL;
    else process.env.OPS_EMAIL = previousOps;
    sent = [];
    await payload
      .delete({
        collection: "outbox",
        where: { order: { equals: orderId } },
        overrideAccess: true,
      })
      .catch(() => null);
    await payload
      .delete({ collection: "shipments", id: shipmentId, overrideAccess: true })
      .catch(() => null);
    await payload
      .delete({ collection: "orders", id: orderId, overrideAccess: true })
      .catch(() => null);
    await payload
      .delete({ collection: "carriers", id: carrierId, overrideAccess: true })
      .catch(() => null);
    await payload
      .delete({ collection: "variants", id: variantId, overrideAccess: true })
      .catch(() => null);
    await payload
      .delete({ collection: "products", id: productId, overrideAccess: true })
      .catch(() => null);
  });

  it("el pedido acabó entregado", async () => {
    const order = (await payload.findByID({
      collection: "orders",
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string };
    expect(order.status).toBe("delivered");
  });

  it("el almacén recibió la orden de preparación", () => {
    const mail = opsMail("Preparar pedido");
    expect(mail, "nadie recibió la orden de preparación").toBeDefined();
    expect(mail?.to).toBe(OPS);
    expect(String(mail?.text)).toContain(`${FIXTURE_SKU} × 1`);
  });

  it("quien compró recibió el seguimiento, con lo que la máquina guardó", () => {
    /*
     * Aquí es donde se ve si las dos capas hablan el mismo idioma. La máquina
     * guarda `{carrier, carrierName, trackingNumber, trackingUrl, shippedAt,
     * incoterm}`; si el handler leyera `carrier` (el código) donde debe leer
     * `carrierName` (el nombre), el correo diría «walk-courier» y las otras
     * dos suites seguirían verdes.
     */
    const mail = mailTo(BUYER, "Tu pedido va en camino");
    expect(mail, "no salió el correo de seguimiento").toBeDefined();
    expect(mail?.to).toBe(BUYER);
    expect(String(mail?.text)).toContain("Courier del recorrido");
    expect(String(mail?.text)).toContain(TRACKING);
    expect(String(mail?.text)).toContain(`https://walk.test/track/${TRACKING}`);
    // El incoterm viaja en la fila, no se recalcula: sale de España DDP.
    expect(String(mail?.text)).toContain("aranceles");
  });

  it("y el de entrega, con el plazo de desistimiento", () => {
    const mail = mailTo(BUYER, "Entregado");
    expect(mail, "no salió el correo de posventa").toBeDefined();
    expect(mail?.to).toBe(BUYER);
    expect(String(mail?.text)).toContain("desistir");
    // 25 ago + 14 días = 8 sep. La fecha, no un plazo relativo.
    expect(String(mail?.text)).toContain("8 de septiembre de 2026");
  });

  it("la fecha del pedido y la del correo son la MISMA, aunque se calculen aparte", async () => {
    // La duplicación es deliberada —ver la cabecera— y solo es segura si no
    // pueden discrepar.
    const order = (await payload.findByID({
      collection: "orders",
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { withdrawalDeadline?: string | null };
    expect(order.withdrawalDeadline, "la ventana no se abrió").toBeTruthy();
    expect(new Date(String(order.withdrawalDeadline)).toISOString()).toBe(
      "2026-09-08T09:00:00.000Z",
    );
    expect(String(mailTo(BUYER, "Entregado")?.text)).toContain("8 de septiembre de 2026");
  });

  it("no quedó ninguna fila de este pedido sin despachar que tuviera handler", async () => {
    /*
     * El resto —`issue_tax_invoice`, `notify_crm`, `send_confirmation_email`—
     * siguen pendientes A PROPÓSITO y `outbox-handlers.ts` dice por qué cada
     * una. Lo que no puede quedar pendiente es algo que SÍ tiene handler: eso
     * sería una fila reclamada y perdida.
     */
    const { outboxHandlers } = await import("./outbox-handlers");
    const registered = new Set(Object.keys(outboxHandlers()));
    const rows = (await payload.find({
      collection: "outbox",
      where: { order: { equals: orderId } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })) as unknown as { docs: { effect: string; status: string }[] };

    const stuck = rows.docs.filter(
      (row) => registered.has(row.effect) && row.status !== "dispatched",
    );
    expect(
      stuck.map((row) => `${row.effect}:${row.status}`),
      "efectos con handler que no llegaron a despacharse",
    ).toEqual([]);

    /*
     * Y de este pedido, TODOS tienen handler — que es la noticia. Los cuatro
     * efectos del fulfilment se ejecutan desde el 22 ago 2026; los que siguen
     * sin handler los encola un PAGO (`issue_tax_invoice`, `notify_crm`,
     * `send_confirmation_email`), y aquí no hay pago: el pedido nace `paid`
     * porque ninguna pasarela tiene credenciales. Si algún día este `toEqual`
     * deja de estar vacío sin que nadie lo haya decidido, es que el recorrido
     * encoló algo que nadie ejecuta.
     */
    const withoutHandler = rows.docs.filter((row) => !registered.has(row.effect));
    expect(
      withoutHandler.map((row) => row.effect),
      "el recorrido de fulfilment encoló un efecto que nadie ejecuta",
    ).toEqual([]);
    expect(rows.docs.length).toBe(4);
  });
});
