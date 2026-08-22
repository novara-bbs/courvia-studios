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
  MAX_CART_LINE_QUANTITY,
  exactQuantity,
  stockSignal,
} from "@courvia/commerce-domain";
import type { CartRef, CommerceOwner, CustomerRef, OrderRef, VariantRef } from "@courvia/commerce-domain";
import {
  describeAvailabilityContract,
  describeCartContract,
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

/** Carrito de otra conexión: ni se lee ni se toca. */
const FOREIGN_CART: CartRef = {
  kind: "cart",
  engine: "shopify",
  connectionKey: "some-shop",
  externalId: "gid://shopify/Cart/1",
};

/** Variante de otra conexión: no entra en un carrito nativo. */
const FOREIGN_VARIANT: VariantRef = {
  kind: "variant",
  engine: "shopify",
  connectionKey: "some-shop",
  externalId: "gid://shopify/ProductVariant/1",
};

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
    shippingAmount: 0,
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
  // Los carritos que crearon las suites de contrato. Se borran por conexión
  // y no por sesión: cada `createCart` genera una sesión nueva y ninguna se
  // guarda aquí.
  await payload.delete({
    collection: "carts",
    where: { connectionKey: { equals: OWNER.connectionKey } },
    overrideAccess: true,
  });
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

  describeCartContract("NativeCommerceEngine", make, {
    market: "es",
    // La variante contada, que además tiene precio en `es`: así el contrato
    // ejercita la proyección con precio y no solo la de `unitAmount: null`.
    variant: (): VariantRef => ({
      kind: "variant",
      engine: "native",
      connectionKey: OWNER.connectionKey,
      externalId: String(variantIdBySku.get(COUNTED_SKU) ?? 0),
    }),
    foreignVariant: FOREIGN_VARIANT,
    foreignCart: FOREIGN_CART,
    unknownCart: {
      kind: "cart",
      engine: "native",
      connectionKey: OWNER.connectionKey,
      // Una sesión con la forma correcta que no existe: el contrato exige
      // `null` al leerla y un fallo al mutarla.
      externalId: "00000000000000000000000000000000ffffffffffffffffffffffffffffffff",
    },
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
    it("declara carrito, y el precio del carrito NO es autoritativo", async () => {
      expect(engine.capabilities.cart).toBe(true);
      const variantId = variantIdBySku.get(COUNTED_SKU);
      if (variantId === undefined) throw new Error("la fixture no creó la variante contada");
      const variant: VariantRef<"native"> = {
        kind: "variant",
        engine: "native",
        connectionKey: OWNER.connectionKey,
        externalId: String(variantId),
      };
      const cart = await engine.createCart({ market: "es", lines: [{ variant, quantity: 3 }] });
      // El precio se lee vivo de `prices`, no se copia a la fila: la única
      // forma de comprobar que es así es que el carrito lo traiga sin que
      // nadie se lo haya guardado.
      expect(cart.lines[0]?.unitAmount).toEqual({ amount: 100_000, currency: "EUR" });
      expect(cart.subtotal).toEqual({ amount: 300_000, currency: "EUR" });
      const stored = await (await loadPayload()).find({
        collection: "carts",
        where: { sessionId: { equals: cart.ref.externalId } },
        depth: 0,
        overrideAccess: true,
      });
      const line = (stored.docs[0] as unknown as { lines: Record<string, unknown>[] }).lines[0];
      expect(Object.keys(line ?? {})).not.toContain("unitAmount");
    });

    it("el mercado decide la moneda del carrito, y no se convierte", async () => {
      // ADR-05: precios fijos por moneda. El mismo carrito en `uk` vale 90.000
      // GBP porque hay una fila de precio en GBP, no porque se convierta.
      const variantId = variantIdBySku.get(COUNTED_SKU);
      if (variantId === undefined) throw new Error("la fixture no creó la variante contada");
      const cart = await engine.createCart({
        market: "uk",
        lines: [
          {
            variant: {
              kind: "variant",
              engine: "native",
              connectionKey: OWNER.connectionKey,
              externalId: String(variantId),
            },
            quantity: 1,
          },
        ],
      });
      expect(cart.currency).toBe("GBP");
      expect(cart.subtotal).toEqual({ amount: 90_000, currency: "GBP" });
    });

    it("una variante retirada no entra en el carrito", async () => {
      // Dejarla entrar sería llevar al cliente a un checkout que la rechaza.
      const retiredId = variantIdBySku.get(RETIRED_SKU);
      if (retiredId === undefined) throw new Error("la fixture no creó la variante retirada");
      const cart = await engine.createCart({ market: "es" });
      const error = await rejection(() =>
        engine.addLine(cart.ref, {
          variant: {
            kind: "variant",
            engine: "native",
            connectionKey: OWNER.connectionKey,
            externalId: String(retiredId),
          },
          quantity: 1,
        }),
      );
      expect(String(error)).toContain("cart_unknown_variant");
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

  /* ------------------------------------ lo que solo se ve concurriendo */

  describe("el carrito bajo dos manos a la vez", () => {
    /** Una referencia de variante de ESTA conexión, por SKU de la fixture. */
    function variantOf(sku: string): VariantRef<"native"> {
      const id = variantIdBySku.get(sku);
      if (id === undefined) throw new Error(`la fixture no creó ${sku}`);
      return {
        kind: "variant",
        engine: "native",
        connectionKey: OWNER.connectionKey,
        externalId: String(id),
      };
    }

    it("dos «añadir» simultáneos suman dos, no uno", async () => {
      // ESTE es el fallo que el lock cierra, y no es teórico: `addLine` leía
      // las líneas, calculaba la suma y escribía el array entero. Dos
      // peticiones que leen «0» a la vez escriben las dos «1», y la segunda
      // pisa a la primera: el visitante pulsa dos veces y se lleva una
      // unidad. Con el `SELECT … FOR UPDATE` de `#mutate`, la segunda espera
      // y relee el 1 que la primera confirmó.
      const variant = variantOf(COUNTED_SKU);
      const cart = await engine.createCart({ market: "es" });
      await Promise.all([
        engine.addLine(cart.ref, { variant, quantity: 1 }),
        engine.addLine(cart.ref, { variant, quantity: 1 }),
      ]);
      const after = await engine.getCart(cart.ref);
      expect(after?.lines).toHaveLength(1);
      expect(after?.lines[0]?.quantity, "una de las dos escrituras se perdió").toBe(2);
    });

    it("el clic veintiuno se rechaza, y deja la línea en veinte", async () => {
      // El tope tiene que vivir donde se GUARDA: el zod de la acción validaba
      // por PETICIÓN y el formulario manda siempre «1», así que veintiún
      // clics dejaban la línea en 21 — y entonces el selector de la página
      // (opciones 1..20) recibía un valor que no existe, el navegador elegía
      // «1» y quien pulsara «Actualizar» perdía veinte unidades.
      const variant = variantOf(COUNTED_SKU);
      const cart = await engine.createCart({ market: "es" });
      for (let click = 0; click < MAX_CART_LINE_QUANTITY; click += 1) {
        await engine.addLine(cart.ref, { variant, quantity: 1 });
      }
      const error = await rejection(() => engine.addLine(cart.ref, { variant, quantity: 1 }));
      expect(String(error)).toContain("cart_invalid_quantity");
      const after = await engine.getCart(cart.ref);
      expect(after?.lines[0]?.quantity).toBe(MAX_CART_LINE_QUANTITY);
    });

    it("cambiar la cantidad de una línea que no está es un error, no un «ok»", async () => {
      // Antes contestaba el carrito sin haber hecho nada, y la vista pintaba
      // éxito sobre una operación que no ocurrió.
      const cart = await engine.createCart({ market: "es" });
      const error = await rejection(() =>
        engine.setLineQuantity(cart.ref, variantOf(COUNTED_SKU), 2),
      );
      expect(String(error)).toContain("cart_line_not_found");
    });

    it("subir la cantidad de una variante retirada se rechaza; bajarla o quitarla, no", async () => {
      // La variante se retira DESPUÉS de que la línea exista, que es el caso
      // real: nadie deja de vender algo antes de que nadie lo tenga en el
      // carrito. Bajar y quitar tienen que seguir funcionando — es justo lo
      // que hay que dejar hacer con algo que ya no se vende.
      const payload = await loadPayload();
      const variant = variantOf(UNTRACKED_SKU);
      const cart = await engine.createCart({ market: "es", lines: [{ variant, quantity: 2 }] });
      await payload.update({
        collection: "variants",
        id: Number(variant.externalId),
        data: { active: false },
        overrideAccess: true,
      });
      try {
        const error = await rejection(() => engine.setLineQuantity(cart.ref, variant, 3));
        expect(String(error)).toContain("cart_unknown_variant");
        const lowered = await engine.setLineQuantity(cart.ref, variant, 1);
        expect(lowered.lines[0]?.quantity).toBe(1);
        const emptied = await engine.setLineQuantity(cart.ref, variant, 0);
        expect(emptied.lines).toHaveLength(0);
      } finally {
        await payload.update({
          collection: "variants",
          id: Number(variant.externalId),
          data: { active: true },
          overrideAccess: true,
        });
      }
    });

    it("un carrito caducado se comporta como inexistente antes de que pase el barrendero", async () => {
      // Las dos mitades de `expire-carts.ts`: el motor filtra por fecha, así
      // que la caducidad vale desde el segundo en que ocurre y no desde el
      // siguiente tick — que con cadencia diaria son hasta 24 h de diferencia
      // entre lo que dice el campo y lo que hace el carrito.
      const payload = await loadPayload();
      const cart = await engine.createCart({
        market: "es",
        lines: [{ variant: variantOf(COUNTED_SKU), quantity: 1 }],
      });
      const row = await payload.find({
        collection: "carts",
        where: { sessionId: { equals: cart.ref.externalId } },
        depth: 0,
        overrideAccess: true,
      });
      const rowId = row.docs[0]?.id;
      expect(rowId, "el carrito no llegó a la tabla").toBeDefined();
      await payload.update({
        collection: "carts",
        id: rowId as number,
        data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
        overrideAccess: true,
      });

      expect(await engine.getCart(cart.ref), "un carrito caducado sigue leyéndose").toBeNull();

      const { sweepStaleCarts } = await import("../scripts/sweep-carts");
      const swept = await sweepStaleCarts(payload);
      expect(swept.deleted).toBeGreaterThanOrEqual(1);
      const gone = await payload.find({
        collection: "carts",
        where: { id: { equals: rowId } },
        depth: 0,
        overrideAccess: true,
      });
      expect(gone.docs, "el barrendero no borró la fila").toHaveLength(0);
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
      expect(runtime.cart).not.toBeNull();
      // Y las ranuras de lo que no declara son null, no un objeto que lanza.
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
