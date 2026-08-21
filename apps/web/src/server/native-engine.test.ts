/**
 * El motor nativo hablando el vocabulario de ADR-029, contra el Postgres de
 * verdad, y la fachada que lo resuelve.
 *
 * Las suites de contrato son las del dominio: si esto pasa, el nativo es
 * intercambiable por el sitio donde el vocabulario dice que lo es. Encima de
 * ellas hay tests que afirman lo que solo se ve en una base de datos real —
 * que una variante retirada deja de publicar stock, que una variante sin fila
 * de inventario contesta «no lo sé» y no «agotado»— y los de la fachada, que
 * afirman lo contrario de lo cómodo: que `forCart` y `forOrder` **fallan** en
 * vez de contestar la conexión activa.
 *
 * Fixtures propias y desechables (`engine-rig`, SKUs `ENG-…`), sin tocar las
 * de `commerce-adapter.test.ts` ni el catálogo real, que es todo waitlist y
 * sin precios por diseño (ADR-022).
 *
 * El pedido de fixture se inserta directo con la Local API a propósito: no es
 * una transición, es una fila de partida. Nada aquí mueve un estado sin la
 * máquina — `requestReturn` sí la usa, y por eso el pedido nace `delivered`.
 */
import {
  CommerceOwnerMismatchError,
  exactQuantity,
  stockSignal,
} from "@courvia/commerce-domain";
import type { CommerceOwner, CustomerRef, OrderRef } from "@courvia/commerce-domain";
import {
  describeAvailabilityContract,
  describeCatalogReadContract,
  describeCustomerOrderContract,
  describeEngineCapabilitiesContract,
  describeReturnWriteContract,
} from "@courvia/commerce-domain/testing";
import { NativeCommerceEngine } from "@courvia/commerce-payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
// Esta suite crea y borra filas: solo contra una base desechable.
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** La conexión que el composition root declara hoy (provisional, Fase 2). */
const OWNER: CommerceOwner<"native"> = {
  siteKey: "courvia",
  engine: "native",
  connectionKey: "native-primary",
  bindingRevision: 1,
};

const SLUG = "engine-rig";
const COUNTED_SKU = "ENG-RIG-P"; // activa, con fila de inventario
const UNTRACKED_SKU = "ENG-RIG-B"; // activa, SIN fila de inventario
const RETIRED_SKU = "ENG-RIG-X"; // inactiva, y con stock en la fila
const CUSTOMER_EMAIL = "engine-contract@courvia.test";

const ON_HAND = 7;
const COMMITTED = 2;
const RETIRED_ON_HAND = 9;

/** Referencia de otra conexión: ni se lee ni se toca. */
const FOREIGN_ORDER: OrderRef = {
  kind: "order",
  engine: "shopify",
  connectionKey: "some-shop",
  externalId: "gid://shopify/Order/1",
};

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function loadContainer() {
  return import("./container");
}

/** Un rechazo tiene que ser un rechazo: un `throw` síncrono escapa antes de
 *  que exista la promesa y ningún `.catch()` del llamante lo vería. */
async function rejection(call: () => Promise<unknown>): Promise<unknown> {
  let promise: Promise<unknown>;
  try {
    promise = call();
  } catch (error) {
    throw new Error(`lanzó de forma síncrona (${String(error)}) en vez de rechazar`);
  }
  return promise.then(
    (value) => value,
    (error: unknown) => error,
  );
}

let engine: NativeCommerceEngine;
let productId: number;
let variantIdBySku = new Map<string, number>();
let readOrderId: number;
let returnOrderId: number;

async function seed(): Promise<void> {
  const payload = await loadPayload();
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Engine Rig",
      slug: SLUG,
      sports: ["padel"],
      excerpt: "Banco de pruebas del vocabulario de motores. No es un producto.",
      specs: [],
      launchStatus: "available",
      _status: "published",
    },
  });
  productId = product.id as number;

  const variants: Array<{ sku: string; active: boolean; stock: number | null }> = [
    { sku: COUNTED_SKU, active: true, stock: ON_HAND },
    { sku: UNTRACKED_SKU, active: true, stock: null },
    { sku: RETIRED_SKU, active: false, stock: RETIRED_ON_HAND },
  ];
  for (const spec of variants) {
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: productId, sku: spec.sku, sport: "padel", active: spec.active },
    });
    variantIdBySku.set(spec.sku, variant.id as number);
    if (spec.stock !== null) {
      await payload.create({
        collection: "inventory",
        overrideAccess: true,
        data: {
          variant: variant.id,
          qtyOnHand: spec.stock,
          qtyCommitted: spec.sku === COUNTED_SKU ? COMMITTED : 0,
        },
      });
    }
    // Precio en dos mercados: el contrato exige que la moneda cambie con el
    // mercado y que no se convierta nunca (ADR-05).
    for (const [market, amount] of [
      ["es", 100_000],
      ["uk", 90_000],
    ] as const) {
      await payload.create({
        collection: "prices",
        overrideAccess: true,
        data: {
          variant: variant.id,
          market,
          amount,
          taxBehavior: "inclusive",
          active: true,
        },
      });
    }
  }

  const countedVariantId = variantIdBySku.get(COUNTED_SKU);
  if (countedVariantId === undefined) throw new Error("la fixture no creó la variante contada");
  const line = {
    variant: countedVariantId,
    sku: COUNTED_SKU,
    quantity: 1,
    unitAmount: 100_000,
  };
  const orderData = {
    status: "delivered" as const,
    market: "es" as const,
    email: CUSTOMER_EMAIL,
    locale: "es",
    lines: [line],
    totalAmount: 100_000,
    taxAmount: 0,
    refundedAmount: 0,
    shippingAddress: {
      name: "Contrato",
      line1: "Calle Uno 1",
      city: "Madrid",
      postalCode: "28001",
      country: "ES",
    },
  };
  readOrderId = (await payload.create({ collection: "orders", overrideAccess: true, data: orderData }))
    .id as number;
  returnOrderId = (
    await payload.create({ collection: "orders", overrideAccess: true, data: orderData })
  ).id as number;
}

async function cleanup(): Promise<void> {
  const payload = await loadPayload();
  const orderIds = [readOrderId, returnOrderId].filter((id) => typeof id === "number");
  if (orderIds.length > 0) {
    await payload.delete({
      collection: "returns",
      where: { order: { in: orderIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "orders",
      where: { id: { in: orderIds } },
      overrideAccess: true,
    });
  }
  const variantIds = [...variantIdBySku.values()];
  if (variantIds.length > 0) {
    for (const collection of ["prices", "inventory"] as const) {
      await payload.delete({
        collection,
        where: { variant: { in: variantIds } },
        overrideAccess: true,
      });
    }
    await payload.delete({
      collection: "variants",
      where: { id: { in: variantIds } },
      overrideAccess: true,
    });
  }
  if (typeof productId === "number") {
    await payload.delete({
      collection: "products",
      where: { id: { equals: productId } },
      overrideAccess: true,
    });
  }
  variantIdBySku = new Map();
}

function orderRef(id: number): OrderRef<"native"> {
  return {
    kind: "order",
    engine: "native",
    connectionKey: OWNER.connectionKey,
    externalId: String(id),
  };
}

if (hasDb && dbIsDisposable) {
  beforeAll(async () => {
    await seed();
    engine = new NativeCommerceEngine({ payload: await loadPayload(), locale: "es", owner: OWNER });
  });
  afterAll(cleanup);

  const make = (): NativeCommerceEngine => engine;

  /* ------------------------------------------------------ contratos */

  describeEngineCapabilitiesContract("NativeCommerceEngine", make);

  describeCatalogReadContract("NativeCommerceEngine", make, {
    knownSlug: SLUG,
    unknownSlug: "no-such-engine-rig",
    market: "es",
    otherMarket: "uk",
    precision: "exact",
  });

  describeAvailabilityContract("NativeCommerceEngine", make, {
    knownSku: COUNTED_SKU,
    unknownSku: "NOPE-ENG",
  });

  describeCustomerOrderContract("NativeCommerceEngine", make, {
    existing: () => Promise.resolve(orderRef(readOrderId)),
    unknown: orderRef(987_654_321),
    foreign: FOREIGN_ORDER,
    customer: () =>
      Promise.resolve<CustomerRef>({
        kind: "customer",
        engine: "native",
        connectionKey: OWNER.connectionKey,
        externalId: CUSTOMER_EMAIL,
      }),
  });

  describeReturnWriteContract("NativeCommerceEngine", make, {
    order: () => Promise.resolve(orderRef(returnOrderId)),
    foreignOrder: FOREIGN_ORDER,
    lines: [{ sku: COUNTED_SKU, quantity: 1 }],
    reason: "damaged_on_arrival",
  });

  /* ------------------------------- lo que declara, y lo que no declara */

  describe("declaración de capacidades del nativo", () => {
    it("no declara carrito, porque no hay carrito", () => {
      expect(engine.capabilities.cart).toBe(false);
      // El contrato ya exige que un no-declarado no exista; esto nombra el
      // método para que el motivo se lea en el diff del día que aparezca.
      expect("createCart" in engine).toBe(false);
    });

    it("no declara checkout mientras ninguna pasarela abra sesión", () => {
      // Los cuatro adaptadores de pago rechazan `createSession` con
      // NotImplementedError: declararlo sería prometer un cobro que en
      // producción no existe.
      expect(engine.capabilities.checkout).toEqual([]);
      expect("startCheckout" in engine).toBe(false);
    });

    it("declara catálogo, disponibilidad exacta, pedidos y devoluciones", () => {
      expect(engine.capabilities).toMatchObject({
        engine: "native",
        mode: "transactional",
        payments: "port",
        catalogRead: true,
        availability: "exact",
        customerOrders: true,
        returns: true,
        catalogAdmin: false,
        eventIngest: false,
      });
    });
  });

  /* ------------------------------------------- disponibilidad honesta */

  describe("disponibilidad", () => {
    it("cuenta qty_on_hand - qty_committed en la variante que lleva inventario", async () => {
      const [entry] = await engine.getAvailability([COUNTED_SKU]);
      expect(entry?.view.kind).toBe("exact");
      expect(exactQuantity(entry!.view)).toBe(ON_HAND - COMMITTED);
      expect(stockSignal(entry!.view)).toBe("in_stock");
    });

    it("una variante activa SIN fila de inventario es «no lo sé», no «agotado»", async () => {
      const [entry] = await engine.getAvailability([UNTRACKED_SKU]);
      // El checkout trata la fila ausente como stock no controlado, así que
      // un 0 aquí diría «agotado» de algo que se puede comprar.
      expect(entry?.view.kind).toBe("unknown");
      expect(stockSignal(entry!.view)).toBe("unknown");
    });

    it("una variante RETIRADA deja de publicar stock — y el método viejo sigue publicándolo", async () => {
      const [entry] = await engine.getAvailability([RETIRED_SKU]);
      expect(entry?.view.kind).toBe("unknown");
      expect(exactQuantity(entry!.view)).toBeNull();

      // El defecto medido, afirmado tal cual para que se vea el día que se
      // arregle: `PayloadCommerceService.getAvailability` consulta variantes
      // solo por SKU, sin `active: true`, así que una variante retirada
      // sigue contando stock. No se toca en esta fase (cero cambio de
      // comportamiento); este test es su acta.
      const { getCommerce } = await loadContainer();
      const legacy = await (await getCommerce("es")).getAvailability([RETIRED_SKU]);
      expect(legacy[0]?.available).toBe(RETIRED_ON_HAND);
    });

    it("contesta una entrada por SKU pedido, en orden y con los repetidos", async () => {
      const asked = [UNTRACKED_SKU, COUNTED_SKU, UNTRACKED_SKU, "NOPE-ENG"];
      const answers = await engine.getAvailability(asked);
      expect(answers.map((a) => a.sku)).toEqual(asked);
      expect(answers.map((a) => a.view.kind)).toEqual(["unknown", "exact", "unknown", "unknown"]);
    });
  });

  /* ------------------------------------------------------------- PDP */

  describe("vista de producto", () => {
    it("lleva referencias de esta conexión y no la variante retirada", async () => {
      const view = await engine.getProduct(SLUG, "es");
      expect(view).not.toBeNull();
      const skus = view!.variants.map((variant) => variant.sku);
      expect(skus).toContain(COUNTED_SKU);
      expect(skus).not.toContain(RETIRED_SKU);
      for (const variant of view!.variants) {
        expect(variant.ref.engine).toBe("native");
        expect(variant.ref.connectionKey).toBe(OWNER.connectionKey);
      }
      expect(view!.ref.kind).toBe("product");
    });

    it("la variante sin inventario no lleva cantidad en la ficha", async () => {
      const view = await engine.getProduct(SLUG, "es");
      const untracked = view!.variants.find((variant) => variant.sku === UNTRACKED_SKU);
      expect(untracked?.availability.kind).toBe("unknown");
      // `available: number` del puerto viejo no viaja de polizón.
      expect("available" in (untracked as object)).toBe(false);
    });
  });

  /* ------------------------------------------------------- pedidos */

  describe("pedidos", () => {
    it("listOrders proyecta el pedido igual que el puerto viejo", async () => {
      // Hay dos traducciones de la misma fila (`toOrder` aquí, el mapeo de
      // `PayloadCommerceService.getOrder` allí). Esto es lo que impide que se
      // separen sin que nadie lo vea.
      const { getCommerce } = await loadContainer();
      const legacy = await (await getCommerce("es")).getOrder(String(readOrderId));
      const listed = await engine.listOrders({
        kind: "customer",
        engine: "native",
        connectionKey: OWNER.connectionKey,
        externalId: CUSTOMER_EMAIL,
      });
      const mine = listed.find((view) => view.ref.externalId === String(readOrderId));
      expect(mine).toBeDefined();
      expect(mine?.order).toEqual(legacy);
    });

    it("rechaza un cliente de otra conexión sin lanzar en síncrono", async () => {
      const outcome = await rejection(() =>
        engine.listOrders({
          kind: "customer",
          engine: "shopify",
          connectionKey: "some-shop",
          externalId: CUSTOMER_EMAIL,
        } as unknown as CustomerRef<"native">),
      );
      expect(outcome).toBeInstanceOf(CommerceOwnerMismatchError);
    });
  });

  /* ------------------------------------------------------- la fachada */

  describe("CommerceFacade", () => {
    it("forSite devuelve la conexión activa con sus capacidades troceadas", async () => {
      const { commerce } = await loadContainer();
      const runtime = await commerce.forSite("courvia");
      expect(runtime.owner).toEqual(OWNER);
      expect(runtime.catalog).not.toBeNull();
      expect(runtime.availability).not.toBeNull();
      expect(runtime.customerOrders).not.toBeNull();
      expect(runtime.returns).not.toBeNull();
      // Y las ranuras de lo que no declara son null, no un objeto que lanza.
      expect(runtime.cart).toBeNull();
      expect(runtime.checkout).toBeNull();
      expect(runtime.catalogAdmin).toBeNull();
      expect(runtime.events).toBeNull();
    });

    it("hay una ranura por capacidad del dominio, sin huecos", async () => {
      const { CAPABILITY_IDS } = await import("@courvia/commerce-domain");
      const { commerce } = await loadContainer();
      const runtime = await commerce.forSite("courvia");
      // Si el dominio añade una capacidad y la fachada no la representa, el
      // consumidor no puede ni preguntar por ella.
      expect(CAPABILITY_IDS.length).toBe(
        Object.keys(runtime).filter((key) => key !== "owner" && key !== "capabilities").length,
      );
    });

    it("un sitio que no está configurado falla con nombre", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() => commerce.forSite("otro-storefront"));
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "unknown_site",
      );
    });

    it("forCart falla en voz alta: no hay carrito ni binding donde mirar", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() => commerce.forCart("cart_session_1"));
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "cart_binding_unavailable",
      );
      // Lo que NO puede pasar: que conteste la conexión activa.
      expect(outcome).not.toHaveProperty("capabilities");
    });

    it("forOrder de otro motor NO devuelve el motor activo", async () => {
      // El fallo que ADR-029 existe para impedir: una devolución de un pedido
      // ajeno ejecutada contra el motor de casa.
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() => commerce.forOrder(FOREIGN_ORDER));
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "engine_not_configured",
      );
      expect(outcome).not.toHaveProperty("capabilities");
      expect(outcome).not.toHaveProperty("owner");
    });

    it("forOrder de otra conexión del MISMO motor tampoco", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() =>
        commerce.forOrder({ ...orderRef(readOrderId), connectionKey: "native-secondary" }),
      );
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "unknown_connection",
      );
      expect(outcome).not.toHaveProperty("capabilities");
    });

    it("forOrder de la conexión del pedido devuelve ese motor", async () => {
      const { commerce } = await loadContainer();
      const ref = orderRef(readOrderId);
      const runtime = await commerce.forOrder(ref);
      expect(runtime.owner.engine).toBe(ref.engine);
      expect(runtime.owner.connectionKey).toBe(ref.connectionKey);
      const view = await runtime.customerOrders?.getOrder(ref);
      expect(view?.ref.externalId).toBe(ref.externalId);
    });
  });
}
