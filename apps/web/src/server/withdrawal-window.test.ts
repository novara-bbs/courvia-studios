/**
 * La ventana de desistimiento: la aritmética, y la escritura.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROTEGIENDO
 * ---------------------------------------------------------------------------
 *
 * Una fecha que decide si una devolución entra en plazo. En España el
 * Art. 102 TRLGDCU da 14 días desde la entrega **y doce meses si no se
 * informa**, así que las dos formas de equivocarse cuestan distinto: no
 * escribirla multiplica el plazo por veintiséis; escribir una inventada se lo
 * quita a quien compró. Por eso hay tests de las dos.
 *
 * ---------------------------------------------------------------------------
 * EL TEST QUE DISTINGUE LA VERSIÓN CORRECTA DE LA ROTA
 * ---------------------------------------------------------------------------
 *
 * «el handler no deshace lo que otro acaba de confirmar» es el único de este
 * fichero que falla si alguien reescribe el handler con `payload.update`. Se
 * comprobó ROJO con esa versión antes de darlo por bueno, y el fallo fue
 * exactamente el que se temía:
 *
 *     expected 'delivered' to be 'refunded'
 *
 * O sea: el reembolso confirmado por el rival desapareció, y el pedido quedó
 * otra vez entregado y sin devolución. El resto de tests pasan con las dos
 * versiones, porque las dos escriben la fecha correcta cuando nadie compite.
 *
 * La carrera es determinista, no un `sleep`: un rival abre una transacción,
 * cambia el estado del pedido y NO confirma; se espera a ver al handler
 * bloqueado en `pg_stat_activity` —eso es observar el lock, no suponerlo—; y
 * solo entonces el rival confirma. Con `payload.update` la lectura previa al
 * lock trae el estado viejo y el `SET` lo reescribe al soltarse: el reembolso
 * desaparece. Es la misma pérdida de escrituras que `tx-sql.ts` documenta
 * medida en cinco sitios de este repo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MARKET_DEFINITIONS, MARKETS } from "@courvia/platform";
import type { MarketId } from "@courvia/platform";

import { dispatchOutbox } from "./outbox";
import { outboxHandlers, withdrawalDeadlineFor } from "./outbox-handlers";

const DAY = 24 * 60 * 60 * 1000;
const DELIVERED_AT = "2026-08-20T09:00:00.000Z";

/** Propios de esta suite: nada más los usa, así que borrarlos no pisa a nadie. */
const FIXTURE_SLUG = "wd-fixture";
const FIXTURE_SKU = "WD-TEST";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

type Payload = Awaited<ReturnType<typeof loadPayload>>;

describe("el plazo por mercado", () => {
  it("España y Reino Unido: catorce días exactos desde la entrega", () => {
    // Los dos son 14 por leyes distintas (Art. 102 TRLGDCU · Consumer
    // Contracts Regulations 2013), y `docs/markets.md` las nombra por
    // separado justamente para que coincidir hoy no se lea como «es lo
    // mismo». Si una de las dos cambia, aquí se ve.
    const delivered = new Date(DELIVERED_AT);
    for (const market of ["es", "uk"] as const) {
      const deadline = withdrawalDeadlineFor(delivered, market);
      expect(deadline, `${market} se quedó sin plazo`).not.toBeNull();
      expect(deadline?.getTime()).toBe(delivered.getTime() + 14 * DAY);
    }
  });

  it("EAU no recibe una fecha inventada: recibe ninguna", () => {
    // El plazo lo fija el contrato, no una ley uniforme (`docs/markets.md`).
    // Un 14 aquí sería derecho español aplicado a Dubái.
    expect(withdrawalDeadlineFor(new Date(DELIVERED_AT), "ae")).toBeNull();
  });

  it("el efecto tiene handler, que es justo lo que le faltó durante meses", () => {
    // El fallo original no era una fecha mal calculada: era que nadie
    // ejecutaba el efecto. La fila se encolaba, el despachador la dejaba
    // `pending` por diseño —no hay handler, no se reclama— y el derecho se
    // quedaba ahí. Un test de aritmética no habría dicho nada de eso.
    expect(outboxHandlers().open_withdrawal_window).toBeTypeOf("function");
  });

  it("ningún mercado se queda sin decisión, ni siquiera uno nuevo", () => {
    // `undefined` sería «nadie lo pensó» y se colaría como `null` —«sin plazo
    // legal»— sin que nadie lo decidiera. Añadir un mercado tiene que obligar
    // a escribir su plazo o a escribir explícitamente que no lo tiene.
    for (const market of MARKETS) {
      const days = MARKET_DEFINITIONS[market].withdrawalDays;
      expect(days === null || typeof days === "number", `${market} sin decidir`).toBe(true);
      if (typeof days === "number") expect(days).toBeGreaterThan(0);
    }
  });
});

describeDb("abrir la ventana escribe en el pedido", () => {
  let payload: Payload;
  const orders: number[] = [];
  const rows: number[] = [];
  let productId: number;
  let variantId: number;

  async function makeOrder(market: MarketId): Promise<number> {
    const created = await payload.create({
      collection: "orders",
      overrideAccess: true,
      data: {
        status: "delivered",
        market,
        email: "desistimiento@courvia.test",
        locale: "es",
        lines: [
          {
            variant: variantId,
            sku: FIXTURE_SKU,
            quantity: 1,
            unitAmount: 1000,
          },
        ],
        totalAmount: 1000,
        taxAmount: 0,
        shippingAmount: 0,
        refundedAmount: 0,
        shippingAddress: {
          name: "Desistimiento",
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

  async function queue(orderId: number, data: Record<string, unknown>): Promise<number> {
    const created = await payload.create({
      collection: "outbox",
      overrideAccess: true,
      data: {
        effect: "open_withdrawal_window" as never,
        order: orderId,
        status: "pending",
        attempts: 0,
        payload: data,
      },
    });
    const id = Number(created.id);
    rows.push(id);
    return id;
  }

  /** Corre SOLO este efecto, con el registro de verdad. */
  async function run(): Promise<void> {
    const handler = outboxHandlers().open_withdrawal_window;
    if (handler === undefined) throw new Error("open_withdrawal_window sin handler");
    await dispatchOutbox(payload, {
      handlers: { open_withdrawal_window: handler },
    });
  }

  async function readOrder(id: number) {
    return (await payload.findByID({
      collection: "orders",
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string; withdrawalDeadline?: string | null };
  }

  async function readRow(id: number) {
    return (await payload.findByID({
      collection: "outbox",
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as {
      status: string;
      attempts: number;
      lastError?: string | null;
    };
  }

  beforeAll(async () => {
    payload = await loadPayload();
    // Busca-o-crea, no crea-a-secas: `slug` es único, así que una ejecución
    // anterior que muriera a mitad dejaría este `beforeAll` fallando para
    // siempre con «campo inválido: slug» — un fallo que no habla del test.
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
                  title: "Banco de pruebas del desistimiento",
                  slug: FIXTURE_SLUG,
                  sports: ["padel"],
                  excerpt: "Fixture de la ventana de desistimiento. No es un producto.",
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
                data: {
                  product: productId,
                  sku: FIXTURE_SKU,
                  sport: "padel",
                  active: true,
                },
              })
            ).id,
          );
  });

  afterAll(async () => {
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

  it("un pedido español entregado queda con fecha, y es la de la entrega + 14", async () => {
    const orderId = await makeOrder("es");
    const rowId = await queue(orderId, {
      deliveredAt: DELIVERED_AT,
      market: "es",
    });

    await run();

    expect((await readRow(rowId)).status).toBe("dispatched");
    const order = await readOrder(orderId);
    expect(order.withdrawalDeadline, "el pedido se quedó sin ventana").toBeTruthy();
    expect(new Date(String(order.withdrawalDeadline)).getTime()).toBe(
      new Date(DELIVERED_AT).getTime() + 14 * DAY,
    );
    // Y la entrega sigue siendo la entrega: escribir la fecha no mueve nada más.
    expect(order.status).toBe("delivered");
  });

  it("un pedido de EAU se queda VACÍO, que no es lo mismo que a cero", async () => {
    const orderId = await makeOrder("ae");
    const rowId = await queue(orderId, {
      deliveredAt: DELIVERED_AT,
      market: "ae",
    });

    await run();

    // El efecto se considera hecho —se miró y no había plazo que fijar—, pero
    // el pedido NO tiene fecha. Una fecha «de hoy» aquí cerraría la ventana
    // el mismo día de la entrega.
    expect((await readRow(rowId)).status).toBe("dispatched");
    expect((await readOrder(orderId)).withdrawalDeadline ?? null).toBeNull();
  });

  it("una fila sin fecha de entrega muere al primer intento, no a los cinco", async () => {
    const orderId = await makeOrder("es");
    const rowId = await queue(orderId, { market: "es" });

    await run();

    const row = await readRow(rowId);
    // Permanente: reintentarlo cuatro veces no le va a poner una fecha.
    expect(row.status).toBe("failed");
    expect(Number(row.attempts)).toBe(1);
    expect(String(row.lastError)).toContain("entrega");
    expect((await readOrder(orderId)).withdrawalDeadline ?? null).toBeNull();
  });

  it("el handler no deshace lo que otro acaba de confirmar", async () => {
    /*
     * EL test de este fichero. Ver la cabecera: rojo con `payload.update`,
     * verde con la sentencia única, y la diferencia es un reembolso que
     * desaparece de un pedido entregado.
     */
    const orderId = await makeOrder("es");
    const rowId = await queue(orderId, {
      deliveredAt: DELIVERED_AT,
      market: "es",
    });

    const db = payload.db as unknown as {
      pool: {
        connect: () => Promise<{
          query: (text: string, values?: unknown[]) => Promise<unknown>;
          release: () => void;
        }>;
        query: (text: string, values?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>;
      };
      schemaName?: string;
      tableNameMap?: Map<string, string>;
    };
    const table = `"${db.schemaName ?? "public"}"."${db.tableNameMap?.get("orders") ?? "orders"}"`;

    const rival = await db.pool.connect();
    let dispatched: Promise<void> | null = null;
    try {
      // 1. El rival toma el pedido y NO confirma. Es la forma que tiene un
      //    webhook de reembolso de estar a medias justo ahora.
      await rival.query("BEGIN");
      await rival.query(`UPDATE ${table} SET status = 'refunded' WHERE id = $1`, [orderId]);

      // 2. El handler arranca y su UPDATE se queda esperando el lock.
      dispatched = run();

      // 3. Se ESPERA A VERLO bloqueado, no se supone: mientras no haya un
      //    backend esperando un lock, la carrera no ha empezado y confirmar
      //    ahora no probaría nada.
      let blocked = false;
      for (let tick = 0; tick < 100 && !blocked; tick += 1) {
        const waiting = await db.pool.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND state = 'active'
              AND query ILIKE '%withdrawal_deadline%'`,
        );
        blocked = Number(waiting.rows?.[0]?.n ?? 0) > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(blocked, "el handler nunca llegó a competir por la fila").toBe(true);

      // 4. Ahora sí.
      await rival.query("COMMIT");
    } finally {
      rival.release();
      if (dispatched !== null) await dispatched;
    }

    expect((await readRow(rowId)).status).toBe("dispatched");
    const order = await readOrder(orderId);
    expect(order.withdrawalDeadline, "la ventana no se escribió").toBeTruthy();
    expect(
      order.status,
      "el handler revirtió el reembolso: leyó el pedido ANTES del lock y lo reescribió entero",
    ).toBe("refunded");
  });
});
