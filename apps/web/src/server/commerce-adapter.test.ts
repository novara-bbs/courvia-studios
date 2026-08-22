/**
 * The real adapter, through the real composition root, against a real
 * Postgres (`pnpm seed:markets` for MarketSettings). Skipped when no
 * DATABASE_URL is configured; CI provides one plus migrations and seeds.
 *
 * The purchasable fixtures are TEST-OWNED: the real catalog (ADR-022) is
 * all-waitlist with no prices by design, so this suite seeds its own
 * disposable priced product in beforeAll and removes it in afterAll —
 * checkout, stock and the payment pipeline stay covered without giving the
 * marketing catalog a fake price.
 *
 * Covers the FULL CommerceService contract (catalog + checkout, ADR-13's
 * proof) and the §4 payment pipeline: ledger-first idempotency, state
 * machine in a transaction, stock movements and the outbox.
 */
import { CheckoutError } from "@courvia/commerce-domain";
import type { PaymentEvent } from "@courvia/commerce-domain";
import { describeCommerceServiceContract } from "@courvia/commerce-domain/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
// This suite WIPES orders/payments/outbox/returns and rewrites inventory:
// it only ever runs against a disposable database — localhost, or CI's
// throwaway service. Point DATABASE_URL anywhere else and it skips.
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";
// The fake gateway drives checkout/webhooks end-to-end without credentials.
process.env.PAYMENT_FAKE_SECRET ??= "test-secret";

/**
 * La cifra de stock de un SKU que SÍ lleva inventario.
 *
 * `Availability.available` es `number | null` desde que un `?? 0` dejó de
 * mentir sobre las variantes sin fila de inventario. Las fixtures de este
 * banco la tienen, así que un `null` aquí no es un caso a tratar: es la
 * fixture rota, y conviene que lo diga con esas palabras y no con un
 * «expected null to be 4».
 */
function counted(rows: readonly { sku: string; available: number | null }[], sku: string): number {
  const row = rows.find((entry) => entry.sku === sku);
  if (row?.available === undefined || row.available === null) {
    throw new Error(`la fixture ${sku} no lleva inventario contado`);
  }
  return row.available;
}

const CHECKOUT_INPUT = {
  market: "es" as const,
  lines: [{ sku: "TST-RIG-P", quantity: 1 }],
  email: "contract@courvia.test",
  provider: "stripe" as const,
  shippingAddress: {
    name: "Test",
    line1: "Calle Uno 1",
    city: "Madrid",
    postalCode: "28001",
    country: "ES",
  },
};

async function loadContainer() {
  return import("./container");
}

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

/** Test-owned purchasable stock: 9 on the checkout SKU (the "5+5 must fail
 *  as a sum" case depends on it), 12 on the secondary reserve/release SKU. */
const TEST_STOCK: Record<string, number> = {
  "TST-RIG-P": 9,
  "TST-RIG-B": 12,
};

const TEST_PRICES: Record<string, Partial<Record<"es" | "uk", number>>> = {
  // 129000 is what the checkout total assertions expect.
  "TST-RIG-P": { es: 129_000, uk: 112_000 },
  "TST-RIG-B": { es: 99_000 },
};

/** Creates the disposable priced product the suite checks out against. */
async function seedTestCatalog() {
  const payload = await loadPayload();
  const existing = await payload.find({
    collection: "products",
    where: { slug: { equals: "test-rig" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return;
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Test Rig",
      slug: "test-rig",
      sports: ["padel"],
      excerpt: "Banco de pruebas del contrato de commerce. No es un producto.",
      specs: [],
      launchStatus: "available",
      _status: "published",
    },
  });
  for (const [sku, prices] of Object.entries(TEST_PRICES)) {
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: product.id, sku, sport: "padel", active: true },
    });
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variant.id, qtyOnHand: TEST_STOCK[sku] ?? 0, qtyCommitted: 0 },
    });
    for (const [market, amount] of Object.entries(prices)) {
      await payload.create({
        collection: "prices",
        overrideAccess: true,
        data: {
          variant: variant.id,
          market: market as "es" | "uk",
          amount,
          taxBehavior: "inclusive",
          active: true,
        },
      });
    }
  }
}

/** Removes the rig (and its variants/prices/inventory) from the shared DB. */
async function removeTestCatalog() {
  const payload = await loadPayload();
  const product = (
    await payload.find({
      collection: "products",
      where: { slug: { equals: "test-rig" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];
  if (product === undefined) return;
  const variants = await payload.find({
    collection: "variants",
    where: { product: { equals: product.id } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  const variantIds = variants.docs.map((doc) => doc.id);
  if (variantIds.length > 0) {
    await payload.delete({
      collection: "prices",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "inventory",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "variants",
      where: { id: { in: variantIds } },
      overrideAccess: true,
    });
  }
  await payload.delete({ collection: "products", where: { id: { equals: product.id } }, overrideAccess: true });
}

async function resetCommerceRows() {
  const payload = await loadPayload();
  for (const collection of ["outbox", "payments", "returns"] as const) {
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true });
  }
  await payload.delete({
    collection: "orders",
    where: { id: { exists: true } },
    overrideAccess: true,
  });
  const variants = await payload.find({
    collection: "variants",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  const skuByVariant = new Map(variants.docs.map((doc) => [doc.id, doc.sku]));
  const inventory = await payload.find({
    collection: "inventory",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  for (const row of inventory.docs) {
    const variantId = typeof row.variant === "object" ? row.variant.id : row.variant;
    const sku = skuByVariant.get(variantId);
    const qtyOnHand = sku !== undefined && sku in TEST_STOCK ? TEST_STOCK[sku]! : row.qtyOnHand;
    await payload.update({
      collection: "inventory",
      id: row.id,
      data: { qtyOnHand, qtyCommitted: 0 },
      overrideAccess: true,
    });
  }
}

if (hasDb && dbIsDisposable) {
  beforeAll(async () => {
    await seedTestCatalog();
    await resetCommerceRows();
  });
  afterAll(async () => {
    await resetCommerceRows();
    await removeTestCatalog();
  });

  describeCommerceServiceContract(
    "PayloadCommerceService (via container)",
    async () => {
      const { getCommerce } = await loadContainer();
      return getCommerce("es");
    },
    {
      knownSlug: "test-rig",
      unknownSlug: "no-such-robot",
      knownSku: "TST-RIG-P",
      unknownSku: "NOPE-0",
      market: "es",
      otherMarket: "uk",
      checkout: CHECKOUT_INPUT,
    },
  );

  describe("el porte entra en lo que se cobra", () => {
    it("suma el envío al total y lo guarda aparte", async () => {
      /*
       * El total tiene que ser el que el cliente va a pagar. Hasta ahora era
       * la suma de las líneas y nada más: el porte no existía en el modelo,
       * así que un pedido de 9,90 € de envío se cobraba como si el envío
       * fuera gratis.
       *
       * `seed:markets` pone ES en 9,90 € con umbral de 100 €. Este banco
       * vende a 1.290 €, que supera el umbral — así que para VER el cargo hay
       * que mirar un carrito por debajo, y el que hay es este: se baja el
       * umbral del mercado durante el test y se restaura.
       */
      const { getCommerce } = await loadContainer();
      const payload = await loadPayload();
      const before = await payload.findGlobal({ slug: "market-settings", depth: 0 });
      const markets = (before.markets ?? []) as Array<Record<string, unknown>>;
      await payload.updateGlobal({
        slug: "market-settings",
        data: {
          markets: markets.map((row) =>
            row.market === "es" ? { ...row, shipping: { flatAmount: 990, freeOver: null } } : row,
          ),
        } as never,
      });
      try {
        const service = await getCommerce("es");
        const checkout = await service.createCheckout({
          ...CHECKOUT_INPUT,
          email: "porte@courvia.test",
        });
        const order = await service.getOrder(checkout.orderId);
        // 129.000 de producto + 990 de porte, calculado en servidor.
        expect(order?.total).toEqual({ amount: 129_990, currency: "EUR" });
        expect(order?.shippingTotal, "el porte no se guardó aparte").toEqual({
          amount: 990,
          currency: "EUR",
        });
      } finally {
        await payload.updateGlobal({ slug: "market-settings", data: { markets } as never });
      }
    });

    it("un mercado SIN tarifa configurada no cobra: se niega", async () => {
      /*
       * `null` es «nadie lo ha configurado» y `0` es «este mercado no cobra
       * envío». Colapsar el primero en el segundo sería regalar el porte de
       * cada pedido de ese mercado hasta que alguien mirase la cuenta — la
       * misma clase de cero que ya mintió esta semana en
       * `Availability.available`. Un error antes de cobrar es más barato.
       */
      const { getCommerce } = await loadContainer();
      const payload = await loadPayload();
      const before = await payload.findGlobal({ slug: "market-settings", depth: 0 });
      const markets = (before.markets ?? []) as Array<Record<string, unknown>>;
      await payload.updateGlobal({
        slug: "market-settings",
        data: {
          markets: markets.map((row) =>
            row.market === "es"
              ? { ...row, shipping: { flatAmount: null, freeOver: null } }
              : row,
          ),
        } as never,
      });
      try {
        const service = await getCommerce("es");
        await expect(
          service.createCheckout({ ...CHECKOUT_INPUT, email: "sin-tarifa@courvia.test" }),
        ).rejects.toMatchObject({ code: "market_disabled" });
      } finally {
        await payload.updateGlobal({ slug: "market-settings", data: { markets } as never });
      }
    });
  });

  describe("una pasarela que no sabe cobrar no se queda con el stock", () => {
    it("suelta la reserva en el acto y responde provider_not_available", async () => {
      /*
       * `createCheckout` reserva stock DENTRO de la transacción y pide sesión
       * a la pasarela DESPUÉS del commit, que es lo correcto: llamar a una
       * pasarela con la transacción abierta retendría el lock durante un
       * viaje de red.
       *
       * Lo que no era correcto era qué pasa cuando esa llamada falla. «Se
       * queda en `pending_payment` y el barrido lo libera» vale para un fallo
       * transitorio —un 500, un timeout—: el intento existió y merece su hora
       * de gracia. `NotImplementedError` no es eso: es «este proveedor NUNCA
       * va a cobrar», que es lo que contestan HOY los cuatro adaptadores. Con
       * el cron diario, cada intento de compra retenía su unidad hasta 24 h
       * por un pago que nadie llegó a intentar.
       *
       * Se construye el servicio a mano con esa pasarela porque el container
       * inyecta el proveedor falso, que sí sabe abrir sesión: lo que hay que
       * ejercitar es el adaptador de verdad, y los de verdad lanzan.
       */
      const { PayloadCommerceService } = await import("@courvia/commerce-payload");
      const { NotImplementedError } = await import("@courvia/commerce-domain");
      const payload = await loadPayload();
      const mudo = {
        id: "stripe" as const,
        createSession: () => Promise.reject(new NotImplementedError("createSession", "test")),
        refund: () => Promise.reject(new NotImplementedError("refund", "test")),
        verifyWebhook: () => Promise.resolve(null),
        normalizeEvent: () => null,
      };
      const service = new PayloadCommerceService(payload, "es", { stripe: mudo as never });

      const before = counted(await service.getAvailability(["TST-RIG-B"]), "TST-RIG-B");
      await expect(
        service.createCheckout({
          ...CHECKOUT_INPUT,
          lines: [{ sku: "TST-RIG-B", quantity: 2 }],
          email: "pasarela-muda@courvia.test",
        }),
      ).rejects.toMatchObject({ code: "provider_not_available" });

      // Lo que importa: el almacén está como estaba, sin esperar al tick.
      expect(
        counted(await service.getAvailability(["TST-RIG-B"]), "TST-RIG-B"),
        "la reserva se quedó colgada esperando al barrendero",
      ).toBe(before);

      // Y el pedido no se queda mintiendo en `pending_payment`.
      const orders = await payload.find({
        collection: "orders",
        where: { email: { equals: "pasarela-muda@courvia.test" } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      expect((orders.docs[0] as { status?: string } | undefined)?.status).toBe("cancelled");
    });
  });

  describe("checkout guardrails (§4)", () => {
    it("rejects a provider the market does not offer", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      await expect(
        service.createCheckout({ ...CHECKOUT_INPUT, provider: "tabby" }),
      ).rejects.toMatchObject({ code: "provider_not_available" });
    });

    it("rejects an unknown sku with a typed code", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      const failure = await service
        .createCheckout({ ...CHECKOUT_INPUT, lines: [{ sku: "NOPE-0", quantity: 1 }] })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(CheckoutError);
      expect((failure as CheckoutError).code).toBe("unknown_sku");
    });

    it("rejects quantities beyond available stock", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      await expect(
        service.createCheckout({ ...CHECKOUT_INPUT, lines: [{ sku: "TST-RIG-P", quantity: 999 }] }),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("reserves stock on checkout and computes the total server-side", async () => {
      const { getCommerce } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const before = counted(await service.getAvailability(["TST-RIG-P"]), "TST-RIG-P");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      const after = counted(await service.getAvailability(["TST-RIG-P"]), "TST-RIG-P");
      expect(after).toBe(before - 1);

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      // 129000 comes from the prices table, not from anything the client sent.
      expect(order?.total).toMatchObject({ amount: 129_000, currency: "EUR" });

      const stored = await payload.findByID({
        collection: "orders",
        id: Number(checkout.orderId),
        depth: 0,
        overrideAccess: true,
      });
      expect(stored.providerPaymentId).toBe(`pi_${checkout.orderId}`);
    });
  });

  describe("checkout expiry sweep", () => {
    it("expires a stale pending_payment checkout and releases its reservation", async () => {
      const { getCommerce } = await loadContainer();
      const { expireStaleCheckouts } = await import("@courvia/commerce-payload");
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const before = counted(await service.getAvailability(["TST-RIG-B"]), "TST-RIG-B");
      const checkout = await service.createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ sku: "TST-RIG-B", quantity: 2 }],
        email: "expiry@courvia.test",
      });
      expect(counted(await service.getAvailability(["TST-RIG-B"]), "TST-RIG-B")).toBe(before - 2);

      // "Older than an hour", measured by a clock an hour ahead: the fresh
      // order qualifies without touching createdAt.
      const result = await expireStaleCheckouts(payload, {
        olderThanMinutes: 60,
        now: () => Date.now() + 61 * 60_000,
      });
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("cancelled");
      expect(counted(await service.getAvailability(["TST-RIG-B"]), "TST-RIG-B")).toBe(before);

      // Idempotent: a second sweep finds nothing to move on this order.
      await expireStaleCheckouts(payload, {
        olderThanMinutes: 60,
        now: () => Date.now() + 61 * 60_000,
      });
      const still = await service.getOrder(checkout.orderId);
      expect(still?.status).toBe("cancelled");
    });

    it("una orden envenenada no aborta el barrido: las demás se liberan y el fallo queda contado", async () => {
      const { getCommerce } = await loadContainer();
      const { expireStaleCheckouts } = await import("@courvia/commerce-payload");
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const poisoned = await service.createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ sku: "TST-RIG-B", quantity: 2 }],
        email: "veneno@courvia.test",
      });
      const healthy = await service.createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ sku: "TST-RIG-B", quantity: 1 }],
        email: "sano@courvia.test",
      });

      // Envenenar la línea por SQL crudo, saltándose la validación: una
      // cantidad negativa hace lanzar el `int()` de tx-sql dentro de
      // `releaseCheckout` — la clase de fila rota que, con cadencia diaria,
      // dejaba las reservas de todas las órdenes siguientes 24 h más presas.
      const db = payload.db as unknown as {
        pool: { query: (text: string, values: unknown[]) => Promise<unknown> };
        schemaName?: string;
      };
      const schema = db.schemaName ?? "public";
      await db.pool.query(
        `update "${schema}"."orders_lines" set "quantity" = -1 where "_parent_id" = $1`,
        [Number(poisoned.orderId)],
      );

      const result = await expireStaleCheckouts(payload, {
        olderThanMinutes: 60,
        now: () => Date.now() + 61 * 60_000,
      });
      expect(result.failed).toBe(1);
      expect(result.expired).toBeGreaterThanOrEqual(1);

      // La sana quedó cancelada; la envenenada sigue pendiente, no a medias.
      expect((await service.getOrder(healthy.orderId))?.status).toBe("cancelled");
      expect((await service.getOrder(poisoned.orderId))?.status).toBe("pending_payment");

      // Reparar la fila para no dejarle una mina al resto de la suite; el
      // siguiente barrido la cancelará por el camino normal.
      await db.pool.query(
        `update "${schema}"."orders_lines" set "quantity" = 2 where "_parent_id" = $1`,
        [Number(poisoned.orderId)],
      );
    });
  });

  describe("una devolución se valida contra el pedido", () => {
    async function freshOrder(quantity: number) {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ sku: "TST-RIG-B", quantity }],
        email: "returns@courvia.test",
      });
      return { service, orderId: checkout.orderId };
    }

    it("rechaza un SKU que el pedido no contiene", async () => {
      const { service, orderId } = await freshOrder(1);
      await expect(
        service.requestReturn({
          orderId,
          lines: [{ sku: "TST-RIG-P", quantity: 1 }],
          reason: "llegó otra cosa",
        }),
      ).rejects.toMatchObject({ code: "unknown_sku" });
    });

    it("rechaza devolver más cantidad de la comprada", async () => {
      const { service, orderId } = await freshOrder(1);
      await expect(
        service.requestReturn({
          orderId,
          lines: [{ sku: "TST-RIG-B", quantity: 2 }],
          reason: "no me gustan",
        }),
      ).rejects.toMatchObject({ code: "return_exceeds_order" });
    });

    it("dos líneas del mismo SKU cuentan como su suma", async () => {
      const { service, orderId } = await freshOrder(1);
      await expect(
        service.requestReturn({
          orderId,
          lines: [
            { sku: "TST-RIG-B", quantity: 1 },
            { sku: "TST-RIG-B", quantity: 1 },
          ],
          reason: "en dos cajas",
        }),
      ).rejects.toMatchObject({ code: "return_exceeds_order" });
    });

    it("una parcial y luego el resto pasan; una unidad más ya no", async () => {
      const { service, orderId } = await freshOrder(2);
      const first = await service.requestReturn({
        orderId,
        lines: [{ sku: "TST-RIG-B", quantity: 1 }],
        reason: "una llegó rota",
      });
      expect(first.status).toBe("requested");
      const second = await service.requestReturn({
        orderId,
        lines: [{ sku: "TST-RIG-B", quantity: 1 }],
        reason: "la otra también",
      });
      expect(second.status).toBe("requested");
      // Las dos anteriores agotan lo comprado: la tercera pide una unidad
      // que el pedido nunca tuvo.
      await expect(
        service.requestReturn({
          orderId,
          lines: [{ sku: "TST-RIG-B", quantity: 1 }],
          reason: "y otra más",
        }),
      ).rejects.toMatchObject({ code: "return_exceeds_order" });
    });
  });

  describe("payment pipeline (§4: ledger-first, transactional, outbox)", () => {
    function paidEvent(orderId: string, eventId: string): PaymentEvent {
      return {
        type: "paid",
        provider: "stripe",
        providerEventId: eventId,
        providerPaymentId: `pi_${orderId}`,
        orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      };
    }

    it("paid moves the order, commits stock and fills the outbox — once", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      const first = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_1"));
      expect(first).toMatchObject({ outcome: "applied", status: "paid" });

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("paid");

      const outbox = await payload.find({
        collection: "outbox",
        where: { order: { equals: Number(checkout.orderId) } },
        depth: 0,
        overrideAccess: true,
      });
      const effects = outbox.docs.map((doc) => doc.effect).sort();
      expect(effects).toEqual(["issue_tax_invoice", "notify_crm", "send_confirmation_email"]);

      // Same event id replayed: the UNIQUE ledger row absorbs it, no effects.
      const replay = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_1"));
      expect(replay).toMatchObject({ outcome: "duplicate" });

      // A DIFFERENT event that says the same thing: expected replay, logged,
      // no second transition and no extra outbox rows.
      const semantic = await applyPaymentEvent(paidEvent(checkout.orderId, "evt_paid_2"));
      expect(semantic).toMatchObject({ outcome: "already_applied" });
      const outboxAfter = await payload.find({
        collection: "outbox",
        where: { order: { equals: Number(checkout.orderId) } },
        depth: 0,
        overrideAccess: true,
      });
      expect(outboxAfter.totalDocs).toBe(outbox.totalDocs);
    });

    it("a refund webhook out of order is rejected as invalid, not applied", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);

      // pending_payment does not accept payment.refunded (docs/data-model.md §10.2).
      const result = await applyPaymentEvent({
        type: "refunded",
        provider: "stripe",
        providerEventId: "evt_refund_early",
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        partial: false,
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(result).toMatchObject({ outcome: "invalid" });
      // Rolled back entirely: the same event id can apply cleanly later.
      const retried = await applyPaymentEvent({
        type: "paid",
        provider: "stripe",
        providerEventId: "evt_refund_early",
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(retried).toMatchObject({ outcome: "applied", status: "paid" });
    });

    it("an underpaid signed event is a CONFLICT: alert row, order untouched", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);

      const result = await applyPaymentEvent({
        type: "paid",
        provider: "stripe",
        providerEventId: `evt_underpaid_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 1, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect(result.outcome).toBe("conflict");

      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      const alerts = await payload.find({
        collection: "outbox",
        where: {
          and: [
            { order: { equals: Number(checkout.orderId) } },
            { effect: { equals: "alert_payment_conflict" } },
          ],
        },
        overrideAccess: true,
      });
      expect(alerts.totalDocs).toBe(1);
    });

    it("paid arriving on a cancelled order raises a conflict, never silence", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent({
        type: "failed",
        provider: "stripe",
        providerEventId: `evt_fail_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 0, currency: "EUR" },
        occurredAt: "2026-08-19T12:00:00.000Z",
      });
      expect((await service.getOrder(checkout.orderId))?.status).toBe("cancelled");

      const late = await applyPaymentEvent(paidEvent(checkout.orderId, `evt_late_${checkout.orderId}`));
      expect(late.outcome).toBe("conflict");
      const alerts = await payload.find({
        collection: "outbox",
        where: {
          and: [
            { order: { equals: Number(checkout.orderId) } },
            { effect: { equals: "alert_payment_conflict" } },
          ],
        },
        overrideAccess: true,
      });
      expect(alerts.totalDocs).toBe(1);
    });

    it("a stale failed AFTER paid is a replay, not an error loop", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_pd_${checkout.orderId}`));

      const stale = await applyPaymentEvent({
        type: "failed",
        provider: "stripe",
        providerEventId: `evt_stale_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 0, currency: "EUR" },
        occurredAt: "2026-08-19T11:59:00.000Z",
      });
      expect(stale.outcome).toBe("already_applied");
      expect((await service.getOrder(checkout.orderId))?.status).toBe("paid");
    });

    it("cumulative refunds land as deltas: partial, then the remainder", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_p1_${checkout.orderId}`));
      await payload.update({
        collection: "orders",
        id: Number(checkout.orderId),
        data: { status: "refund_requested" },
        overrideAccess: true,
      });

      const refund = (cum: number, id: string) =>
        applyPaymentEvent({
          type: "refunded",
          provider: "stripe",
          providerEventId: id,
          providerPaymentId: `pi_${checkout.orderId}`,
          orderId: checkout.orderId,
          amount: { amount: cum, currency: "EUR" },
          partial: cum < 129_000,
          cumulative: true,
          occurredAt: "2026-08-19T13:00:00.000Z",
        });

      const first = await refund(50_000, `evt_r1_${checkout.orderId}`);
      expect(first).toMatchObject({ outcome: "applied", status: "partially_refunded" });

      // Same cumulative total replayed under a new id: zero delta, absorbed.
      const replay = await refund(50_000, `evt_r1b_${checkout.orderId}`);
      expect(replay).toMatchObject({ outcome: "already_applied" });

      // The remainder arrives as the new running total.
      const second = await refund(129_000, `evt_r2_${checkout.orderId}`);
      expect(second).toMatchObject({ outcome: "applied", status: "refunded" });
      const order = await service.getOrder(checkout.orderId);
      expect(order?.refundedTotal).toMatchObject({ amount: 129_000 });
    });

    it("duplicate SKU lines are aggregated before the stock check", async () => {
      const { getCommerce } = await loadContainer();
      const service = await getCommerce("es");
      // 9 on hand: 5+5 must fail as a SUM even though each line alone fits.
      await expect(
        service.createCheckout({
          ...CHECKOUT_INPUT,
          lines: [
            { sku: "TST-RIG-P", quantity: 5 },
            { sku: "TST-RIG-P", quantity: 5 },
          ],
        }),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("refund after approval reaches refunded and tracks the refunded total", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const checkout = await service.createCheckout(CHECKOUT_INPUT);
      await applyPaymentEvent(paidEvent(checkout.orderId, `evt_paid_${checkout.orderId}`));
      // Support marks the refund request (manual-assisted phase 1).
      await payload.update({
        collection: "orders",
        id: Number(checkout.orderId),
        data: { status: "refund_requested" },
        overrideAccess: true,
      });

      const result = await applyPaymentEvent({
        type: "refunded",
        provider: "stripe",
        providerEventId: `evt_refund_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 50_000, currency: "EUR" },
        partial: true,
        occurredAt: "2026-08-19T13:00:00.000Z",
      });
      expect(result).toMatchObject({ outcome: "applied", status: "partially_refunded" });
      const order = await service.getOrder(checkout.orderId);
      expect(order?.refundedTotal).toMatchObject({ amount: 50_000 });
    });
  });

  /**
   * Concurrencia, que es donde este fichero se gana el sueldo.
   *
   * Nada de lo de arriba habría visto el fallo que estos dos tests miran,
   * porque todo lo de arriba aplica un evento cada vez. El idioma que había
   * —`payload.update` con payload vacío «para tomar el lock», y después
   * releer— toma el lock de verdad, pero el `update` por id de Payload es un
   * read-modify-write: carga el documento ANTES del lock y escribe la fila
   * entera al soltarlo, así que el escritor bloqueado se despierta y
   * reescribe lo que el ganador acaba de confirmar.
   *
   * `src/server/outbox.ts` ya lo había medido y documentado para su propia
   * cola; aquí el precio es dinero y stock. Los dos tests corren contra
   * Postgres de verdad y los dos se vieron en ROJO con el código anterior.
   */
  describe("concurrencia: dos webhooks a la vez no se pisan", () => {
    it("dos pedidos pagados a la vez descuentan DOS unidades, no una", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const inventoryRow = async (): Promise<{ qtyOnHand: number; qtyCommitted: number }> => {
        const variants = await payload.find({
          collection: "variants",
          where: { sku: { equals: "TST-RIG-P" } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });
        const found = await payload.find({
          collection: "inventory",
          where: { variant: { equals: variants.docs[0]!.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });
        return found.docs[0] as unknown as { qtyOnHand: number; qtyCommitted: number };
      };

      // Relativo a lo que haya, no a la constante de la fixture: los tests de
      // arriba ya han consumido stock y el banco no se resiembra entre ellos.
      const stockBefore = await inventoryRow();
      const before = counted(await service.getAvailability(["TST-RIG-P"]), "TST-RIG-P");
      const [first, second] = await Promise.all([
        service.createCheckout(CHECKOUT_INPUT),
        service.createCheckout(CHECKOUT_INPUT),
      ]);
      // Dos pedidos de una unidad cada uno: el checkout ya comprometió dos.
      expect(counted(await service.getAvailability(["TST-RIG-P"]), "TST-RIG-P")).toBe(before - 2);

      const paid = (orderId: string): PaymentEvent => ({
        type: "paid",
        provider: "stripe",
        providerEventId: `evt_race_${orderId}`,
        providerPaymentId: `pi_${orderId}`,
        orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-22T00:00:00.000Z",
      });

      // A LA VEZ, que es la única forma de ver esto.
      const [a, b] = await Promise.all([
        applyPaymentEvent(paid(first.orderId)),
        applyPaymentEvent(paid(second.orderId)),
      ]);
      expect(a).toMatchObject({ outcome: "applied", status: "paid" });
      expect(b).toMatchObject({ outcome: "applied", status: "paid" });

      // `commit_stock` consuma la reserva: baja `qty_on_hand` y `qty_committed`
      // en la misma cantidad. Con el idioma anterior una de las dos bajadas
      // se perdía: el stock físico bajaba uno en vez de dos y quedaba una
      // unidad comprometida de un pedido ya pagado, para siempre.
      const stockAfter = await inventoryRow();
      expect(stockAfter.qtyOnHand, "una de las dos bajadas se perdió").toBe(
        stockBefore.qtyOnHand - 2,
      );
      expect(stockAfter.qtyCommitted, "quedó stock comprometido de un pedido pagado").toBe(
        stockBefore.qtyCommitted,
      );
    });

    it("el barrido y un pago a la vez: gana el pago, y el stock se queda comprometido", async () => {
      // ESTE es el que costaba dinero. El barrido escanea fuera de
      // transacción y decide dentro, así que entre las dos cosas cabe un
      // webhook. Con el `payload.update` vacío que tomaba el lock, el barrido
      // reescribía el estado que había cargado ANTES del lock: cancelaba un
      // pedido ya pagado y le devolvía al almacén un stock cobrado. Y los dos
      // trabajos corren en el MISMO tick de cron (`next/cron/route.ts`), así
      // que la carrera no es hipotética.
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const { expireStaleCheckouts } = await import("@courvia/commerce-payload");
      const payload = await loadPayload();
      const service = await getCommerce("es");

      const checkout = await service.createCheckout({
        ...CHECKOUT_INPUT,
        email: "carrera@courvia.test",
      });

      const paid: PaymentEvent = {
        type: "paid",
        provider: "stripe",
        providerEventId: `evt_sweep_${checkout.orderId}`,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-22T00:00:00.000Z",
      };

      // A LA VEZ. El reloj adelantado hace que el pedido recién creado entre
      // en el barrido sin tocar `createdAt`.
      const [applied] = await Promise.all([
        applyPaymentEvent(paid),
        expireStaleCheckouts(payload, {
          olderThanMinutes: 60,
          now: () => Date.now() + 61 * 60_000,
        }),
      ]);

      // Uno de los dos gana, y el orden lo decide el planificador. Lo que NO
      // puede pasar es que el barrido deshaga un `paid`: si el pago llegó
      // primero, el pedido se queda pagado; si llegó después, el barrido lo
      // canceló antes y el pago se rechaza como inválido — nunca «pagado y
      // luego cancelado».
      const order = await service.getOrder(checkout.orderId);
      if (applied.outcome === "applied") {
        expect(order?.status, "el barrido deshizo un pago confirmado").toBe("paid");
      } else {
        expect(order?.status).toBe("cancelled");
        expect(applied.outcome).toBe("invalid");
      }
    });

    it("dos eventos «paid» del MISMO pedido a la vez: uno aplica, el otro no", async () => {
      const { getCommerce, applyPaymentEvent } = await loadContainer();
      const payload = await loadPayload();
      const service = await getCommerce("es");
      const checkout = await service.createCheckout(CHECKOUT_INPUT);

      // Ids de evento DISTINTOS: el índice único del libro mayor no los
      // absorbe, así que lo único que puede impedir la doble transición es el
      // lock de la fila del pedido.
      const paid = (eventId: string): PaymentEvent => ({
        type: "paid",
        provider: "stripe",
        providerEventId: eventId,
        providerPaymentId: `pi_${checkout.orderId}`,
        orderId: checkout.orderId,
        amount: { amount: 129_000, currency: "EUR" },
        occurredAt: "2026-08-22T00:00:00.000Z",
      });

      const outcomes = (
        await Promise.all([
          applyPaymentEvent(paid(`evt_lock_a_${checkout.orderId}`)),
          applyPaymentEvent(paid(`evt_lock_b_${checkout.orderId}`)),
        ])
      )
        .map((result) => result.outcome)
        .sort();
      expect(outcomes).toEqual(["already_applied", "applied"]);

      // Y la consecuencia que se paga si el lock no sujeta: los efectos de
      // `paid` se encolarían dos veces y el cliente recibiría dos correos.
      const outbox = await payload.find({
        collection: "outbox",
        where: { order: { equals: Number(checkout.orderId) } },
        depth: 0,
        overrideAccess: true,
      });
      const effects = outbox.docs.map((doc) => doc.effect).sort();
      expect(effects).toEqual(["issue_tax_invoice", "notify_crm", "send_confirmation_email"]);
    });
  });
} else {
  describe.skip("PayloadCommerceService contract (requires a DISPOSABLE DATABASE_URL: localhost or CI)", () => {
    it("skipped", () => undefined);
  });
}
