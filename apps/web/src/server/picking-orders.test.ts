/**
 * Las dos instrucciones que salen hacia el almacén.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SE PROTEGE, Y POR QUÉ NO ES «QUE SE MANDE UN CORREO»
 * ---------------------------------------------------------------------------
 *
 * `start_picking` y `stop_picking` llevaban desde que existe el fulfilment
 * encolándose sin handler. Registrarlos es fácil; lo que cuesta —y lo que se
 * afirma aquí— es que las dos fallen hacia el lado correcto:
 *
 *  - sin `OPS_EMAIL` NO se registran, así que la fila se queda `pending` y
 *    visible. Registrarlas sin dirección quemaría los cinco intentos y las
 *    dejaría en `failed`, que se ve MENOS que pendiente;
 *  - una `stop_picking` que nadie ejecuta cuenta como fila que exige una
 *    persona; una `start_picking`, no. La asimetría es la decisión, no un
 *    descuido: perder la orden retrasa un envío y el cliente reclama; perder
 *    la contraorden manda un robot cuyo dinero ya va de vuelta.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dispatchOutbox } from "./outbox";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

/** Propios de esta suite: nada más los usa, así que borrarlos no pisa a nadie. */
const FIXTURE_SLUG = "pick-fixture";
const FIXTURE_SKU = "PICK-TEST";
const OPS = "almacen@courvia.test";

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

type Payload = Awaited<ReturnType<typeof loadPayload>>;

describeDb("la orden de preparación y su contraorden", () => {
  let payload: Payload;
  let productId: number;
  let variantId: number;
  const orders: number[] = [];
  const rows: number[] = [];
  let previousOps: string | undefined;

  async function makeOrder(): Promise<number> {
    const created = await payload.create({
      collection: "orders",
      overrideAccess: true,
      data: {
        status: "preparing",
        market: "es",
        email: "almacen@courvia.test",
        locale: "es",
        lines: [{ variant: variantId, sku: FIXTURE_SKU, quantity: 2, unitAmount: 1000 }],
        totalAmount: 2000,
        taxAmount: 0,
        shippingAmount: 0,
        refundedAmount: 0,
        shippingAddress: {
          name: "Almacén",
          line1: "Calle Uno 1",
          city: "Madrid",
          postalCode: "28001",
          country: "ES",
        },
      },
    });
    const id = Number(created.id);
    orders.push(id);
    return id;
  }

  async function queue(effect: string, orderId: number | null): Promise<number> {
    const created = await payload.create({
      collection: "outbox",
      overrideAccess: true,
      data: {
        effect: effect as never,
        ...(orderId === null ? {} : { order: orderId }),
        status: "pending",
        attempts: 0,
        payload: { market: "es" },
      },
    });
    const id = Number(created.id);
    rows.push(id);
    return id;
  }

  async function readRow(id: number) {
    return (await payload.findByID({
      collection: "outbox",
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string; attempts: number; lastError?: string | null };
  }

  /** El registro de verdad, con la dirección puesta. */
  async function handlersWithOps() {
    process.env.OPS_EMAIL = OPS;
    const { outboxHandlers } = await import("./outbox-handlers");
    const all = outboxHandlers();
    const picked: Record<string, (typeof all)[string]> = {};
    for (const effect of ["start_picking", "stop_picking"]) {
      const handler = all[effect];
      if (handler === undefined) throw new Error(`${effect} sin handler`);
      picked[effect] = handler;
    }
    return picked;
  }

  beforeAll(async () => {
    previousOps = process.env.OPS_EMAIL;
    payload = await loadPayload();

    const existing = await payload.find({
      collection: "products",
      where: { slug: { equals: FIXTURE_SLUG } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    });
    productId =
      existing.docs.length > 0
        ? Number(existing.docs[0]?.id)
        : Number(
            (
              await payload.create({
                collection: "products",
                locale: "es",
                draft: false,
                overrideAccess: true,
                data: {
                  title: "Banco de pruebas de preparación",
                  slug: FIXTURE_SLUG,
                  sports: ["padel"],
                  excerpt: "Fixture de las órdenes de almacén. No es un producto.",
                  specs: [],
                  launchStatus: "available",
                  _status: "published",
                },
              })
            ).id,
          );

    const variants = await payload.find({
      collection: "variants",
      where: { sku: { equals: FIXTURE_SKU } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    });
    variantId =
      variants.docs.length > 0
        ? Number(variants.docs[0]?.id)
        : Number(
            (
              await payload.create({
                collection: "variants",
                overrideAccess: true,
                data: { product: productId, sku: FIXTURE_SKU, sport: "padel", active: true },
              })
            ).id,
          );
  });

  afterAll(async () => {
    if (previousOps === undefined) delete process.env.OPS_EMAIL;
    else process.env.OPS_EMAIL = previousOps;
    for (const id of rows) {
      await payload.delete({ collection: "outbox", id, overrideAccess: true }).catch(() => null);
    }
    for (const id of orders) {
      await payload.delete({ collection: "orders", id, overrideAccess: true }).catch(() => null);
    }
    await payload
      .delete({ collection: "variants", id: variantId, overrideAccess: true })
      .catch(() => null);
    await payload
      .delete({ collection: "products", id: productId, overrideAccess: true })
      .catch(() => null);
  });

  it("sin dirección de operaciones no se registran, y la fila sigue viva", async () => {
    delete process.env.OPS_EMAIL;
    const { outboxHandlers } = await import("./outbox-handlers");
    const registered = Object.keys(outboxHandlers());
    expect(registered).not.toContain("start_picking");
    expect(registered).not.toContain("stop_picking");
    // Y el que no depende de una dirección sigue estando: esto comprueba que
    // el registro no se ha vaciado entero, que haría pasar lo de arriba solo.
    expect(registered).toContain("open_withdrawal_window");
  });

  it("la orden lleva las unidades que hay que coger, no un enlace a buscarlas", async () => {
    const orderId = await makeOrder();
    const rowId = await queue("start_picking", orderId);
    const handlers = await handlersWithOps();
    const sent = vi
      .spyOn(payload, "sendEmail")
      .mockResolvedValue(undefined as unknown as ReturnType<typeof payload.sendEmail>);

    try {
      await dispatchOutbox(payload, { handlers });

      const call = sent.mock.calls.find(([m]) => String(m.subject).includes(String(orderId)));
      expect(call, "no salió la orden de preparación").toBeDefined();
      expect(call?.[0].to).toBe(OPS);
      expect(String(call?.[0].subject)).toContain("Preparar");
      // Las líneas viven en el PEDIDO, no en el payload de la fila: si el
      // handler no fuera a buscarlas, aquí no habría nada que coger.
      expect(String(call?.[0].text)).toContain(`${FIXTURE_SKU} × 2`);
      expect(String(call?.[0].text)).toContain("Unidades: 2");
    } finally {
      sent.mockRestore();
    }
    expect((await readRow(rowId)).status).toBe("dispatched");
  });

  it("la contraorden se lee como contraorden, no como una segunda orden", async () => {
    const orderId = await makeOrder();
    const rowId = await queue("stop_picking", orderId);
    const handlers = await handlersWithOps();
    const sent = vi
      .spyOn(payload, "sendEmail")
      .mockResolvedValue(undefined as unknown as ReturnType<typeof payload.sendEmail>);

    try {
      await dispatchOutbox(payload, { handlers });

      const call = sent.mock.calls.find(([m]) => String(m.subject).includes(String(orderId)));
      expect(call, "no salió la contraorden").toBeDefined();
      expect(String(call?.[0].subject)).toContain("NO ENVIAR");
      expect(String(call?.[0].text)).toContain("NO se envía");
    } finally {
      sent.mockRestore();
    }
    expect((await readRow(rowId)).status).toBe("dispatched");
  });

  it("un pedido que ya no existe mata la fila al primer intento, no a los cinco", async () => {
    const orderId = await makeOrder();
    const rowId = await queue("start_picking", orderId);
    await payload.delete({ collection: "orders", id: orderId, overrideAccess: true });
    const handlers = await handlersWithOps();

    await dispatchOutbox(payload, { handlers });

    const row = await readRow(rowId);
    expect(row.status).toBe("failed");
    expect(Number(row.attempts)).toBe(1);
  });

  it("una contraorden sin ejecutar EXIGE una persona; una orden sin ejecutar, no", async () => {
    /*
     * El test de la asimetría, y el único que falla si alguien «arregla» el
     * censo metiendo los dos efectos o quitando los dos. Sin `OPS_EMAIL` no
     * hay handler para ninguno, así que las dos filas se quedan pendientes;
     * lo que cambia es cuál de las dos sale nombrada en el informe que lee
     * una persona.
     */
    delete process.env.OPS_EMAIL;
    const orderId = await makeOrder();
    await queue("stop_picking", orderId);
    await queue("start_picking", orderId);

    const result = await dispatchOutbox(payload, { handlers: {} });

    expect(
      result.needsHuman.pending.stop_picking,
      "una contraorden sin ejecutar dejó de contar como fila que exige una persona",
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.needsHuman.pending.start_picking,
      "una orden de preparación no es una alarma: llenaría el informe de ruido",
    ).toBeUndefined();
    // Las dos siguen contadas como diferidas, que es lo que las mantiene
    // visibles aunque no sean alarma.
    expect(result.deferredByEffect.start_picking).toBeGreaterThanOrEqual(1);
  });
});
