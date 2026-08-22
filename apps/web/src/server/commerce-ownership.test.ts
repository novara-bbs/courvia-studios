/**
 * La propiedad de una transacción, contra el Postgres de verdad (ADR-029, Fase 2).
 *
 * La regla de esta sesión es que un test que afirma la intención declarada en
 * vez del efecto observable pasa con el código roto. Por eso casi todo lo que
 * hay aquí se comprueba **dos veces**: una por la API de Payload —que es como
 * escribe un editor o un adaptador— y otra por SQL crudo contra la tabla, que
 * es lo único que demuestra que la garantía no depende de que nadie use
 * `overrideAccess`, ni de una validación de campo, ni de un comentario.
 *
 * Los cuatro guardarraíles que se rompieron a mano para verlos en rojo están
 * anotados uno a uno más abajo, cada uno junto al test que lo sujeta.
 *
 * Fixtures propias y desechables (prefijo `rig-`), sin tocar el catálogo real
 * ni las de `native-engine.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

import { DEFAULT_SITE_KEY, NATIVE_CONNECTION_KEY } from "../payload/commerce-connections";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
// Esta suite crea y borra filas: solo contra una base desechable.
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Una conexión nativa retirándose: el pedido viejo del que va la mitad de esto. */
const LEGACY_KEY = "rig-legacy";
const LEGACY_REVISION = 7;
/** Una conexión Shopify que existe y NO sirve tráfico. */
const SHOPIFY_KEY = "rig-shopify";
const RIG_SESSION_ACTIVE = "rig-cart-activo";
const RIG_SESSION_LEGACY = "rig-cart-legacy";
const RIG_PRODUCT_SLUG = "rig-producto-editorial";
const RIG_PRODUCT_SLUG_2 = "rig-producto-editorial-renombrado";
const RIG_EMAIL = "ownership-rig@courvia.test";

let payload: BasePayload;
let legacyConnectionId: number;
let shopifyConnectionId: number;
let legacyOrderId: number;
let activeOrderId: number;
let productId: number;
let variantId: number;
let productEditorialKey: string;

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function loadContainer() {
  return import("./container");
}

/** SQL crudo: la mitad de esta suite existe para no creerse la capa de arriba. */
async function query<Row>(sql: string): Promise<Row[]> {
  const db = payload.db as unknown as { pool: { query: (text: string) => Promise<{ rows: Row[] }> } };
  const result = await db.pool.query(sql);
  return result.rows;
}

/**
 * El error que Postgres devolvió — o una frase que lo dice cuando NO hubo
 * ninguno. Devolver `null` ahí hacía que romper un guardarraíl a mano fallara
 * con «toMatch expects a string, but got object», que no dice qué se ha roto.
 */
const NO_ERROR = "(la sentencia PASÓ: ningún guardarraíl la rechazó)";

async function sqlError(sql: string): Promise<string> {
  try {
    await query(sql);
    return NO_ERROR;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Todo lo que un error trae dentro.
 *
 * Payload envuelve el fallo de Postgres en un `Failed query: …` que NO
 * incluye el mensaje del trigger: quedarse en `String(error)` haría pasar
 * este test con cualquier fallo de escritura, incluido un typo en el SQL. La
 * cadena de `cause` es donde está el motivo real, y una `ValidationError`
 * guarda los suyos en `data.errors`.
 */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    const data = (current as { data?: { errors?: { message?: string; label?: string }[] } }).data;
    for (const fieldError of data?.errors ?? []) {
      parts.push(`${fieldError.label ?? ""} ${fieldError.message ?? ""}`);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" ⇐ ");
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

async function seed(): Promise<void> {
  payload = await loadPayload();

  const legacy = await payload.create({
    collection: "commerce-connections",
    overrideAccess: true,
    data: {
      key: LEGACY_KEY,
      siteKey: DEFAULT_SITE_KEY,
      engine: "native",
      // `draining`: sigue operando lo suyo y no acepta carritos nuevos. Es el
      // estado en el que queda la conexión anterior tras un cutover.
      status: "draining",
      secretRef: "env:DATABASE_URL",
    },
  });
  legacyConnectionId = legacy.id as number;

  const shopify = await payload.create({
    collection: "commerce-connections",
    overrideAccess: true,
    data: {
      key: SHOPIFY_KEY,
      siteKey: DEFAULT_SITE_KEY,
      engine: "shopify",
      // `draft` y nada más: el encargo prohíbe activar Shopify.
      status: "draft",
      apiVersion: "2026-07",
      shopDomain: "rig-courvia.myshopify.com",
      secretRef: "env:SHOPIFY_ADMIN_TOKEN",
    },
  });
  shopifyConnectionId = shopify.id as number;

  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Banco de pruebas de propiedad",
      slug: RIG_PRODUCT_SLUG,
      sports: ["padel"],
      excerpt: "Fixture de la Fase 2. No es un producto.",
      specs: [],
      launchStatus: "available",
      _status: "published",
    },
  });
  productId = product.id as number;
  productEditorialKey = product.editorialKey ?? "";

  const variant = await payload.create({
    collection: "variants",
    overrideAccess: true,
    data: { product: productId, sku: "RIG-OWN-P", sport: "padel", active: true },
  });
  variantId = variant.id as number;

  const order = {
    status: "delivered" as const,
    market: "es" as const,
    email: RIG_EMAIL,
    locale: "es",
    lines: [{ variant: variantId, sku: "RIG-OWN-P", quantity: 1, unitAmount: 1000 }],
    totalAmount: 1000,
    taxAmount: 0,
    refundedAmount: 0,
    shippingAddress: {
      name: "Rig",
      line1: "Calle Uno 1",
      city: "Madrid",
      postalCode: "28001",
      country: "ES",
    },
  };

  // Un pedido SIN dueño explícito: lo tiene que poner el hook desde el binding
  // activo. Es el camino por el que pasa `createCheckout`.
  activeOrderId = (
    await payload.create({ collection: "orders", overrideAccess: true, data: order })
  ).id as number;

  // Y un pedido de la conexión que se está retirando, que es el que hace
  // observable la diferencia entre "la conexión del pedido" y "la activa".
  legacyOrderId = (
    await payload.create({
      collection: "orders",
      overrideAccess: true,
      data: {
        ...order,
        siteKey: DEFAULT_SITE_KEY,
        engine: "native",
        connectionKey: LEGACY_KEY,
        bindingRevision: LEGACY_REVISION,
      },
    })
  ).id as number;

  await payload.create({
    collection: "carts",
    overrideAccess: true,
    data: { sessionId: RIG_SESSION_ACTIVE, ...CART_FIXTURE_FIELDS },
  });
  await payload.create({
    collection: "carts",
    overrideAccess: true,
    data: {
      sessionId: RIG_SESSION_LEGACY,
      siteKey: DEFAULT_SITE_KEY,
      engine: "native",
      connectionKey: LEGACY_KEY,
      bindingRevision: LEGACY_REVISION,
      ...CART_FIXTURE_FIELDS,
    },
  });
}

/**
 * Lo que la Fase 4 hizo obligatorio en un carrito. Este banco de pruebas es
 * sobre la PROPIEDAD, no sobre lo que se compra: el mercado y la caducidad
 * están aquí solo para que la fila sea legal.
 */
const CART_FIXTURE_FIELDS = {
  market: "es" as const,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

async function cleanup(): Promise<void> {
  await query(
    `delete from payload.commerce_product_refs where connection_id in (${String(legacyConnectionId)}, ${String(shopifyConnectionId)})`,
  );
  await query(`delete from payload.carts where session_id like 'rig-cart-%'`);
  await query(`delete from payload.orders where email = '${RIG_EMAIL}'`);
  await query(`delete from payload.commerce_bindings where site_key like 'rig-%'`);
  await query(`delete from payload.commerce_bindings where revision >= 900`);
  await query(`delete from payload.variants where sku like 'RIG-OWN-%'`);
  await query(`delete from payload.products where slug like 'rig-producto-%'`);
  await query(`delete from payload.commerce_connections where key like 'rig-%'`);
}

if (hasDb && dbIsDisposable) {
  beforeAll(seed);
  afterAll(cleanup);

  /* ================================================================== */
  /* 1 · Ni un secreto en una fila de conexión                          */
  /* ================================================================== */

  describe("una conexión guarda referencias, nunca secretos", () => {
    /*
     * Estas cadenas se MONTAN, no se escriben.
     *
     * El repositorio es público y GitHub tiene protección de push: un
     * literal con forma de token de Shopify o de clave de Stripe rechaza el
     * push entero, aunque sea inventado — y lo hace bien, porque desde
     * fuera no se distingue de uno real. Pero un test que demuestra «la base
     * rechaza cosas con forma de secreto» necesita, por definición, algo con
     * forma de secreto.
     *
     * Se resuelve partiendo el literal: el fichero nunca contiene la cadena
     * contigua, y el valor que llega al CHECK es exactamente el mismo. Si
     * alguien las «limpia» juntándolas otra vez, el siguiente push se cae.
     */
    const HEX32 = "0123456789abcdef".repeat(2);
    const shopifyTokenShape = ["shpat", HEX32].join("_");
    const stripeKeyShape = ["sk", "live", `51H${"0".repeat(21)}`].join("_");
    const webhookSecretShape = ["whsec", HEX32.slice(0, 16)].join("_");

    /*
     * GUARDARRAÍL ROTO A MANO (1): se quitó el CHECK
     * `commerce_connections_no_secret_values` de la tabla y se relajó
     * `commerce_connections_secret_ref_shape`. Con eso, el INSERT crudo de
     * `shpat_…` de más abajo pasó y este test se puso en rojo. Restaurados los
     * dos CHECK, vuelve a verde.
     */
    it("Postgres rechaza un token pegado en secretRef, aunque nadie pase por Payload", async () => {
      const message = await sqlError(
        `insert into payload.commerce_connections (key, site_key, engine, status, secret_ref, updated_at, created_at)
         values ('rig-token', 'courvia', 'shopify', 'draft', '${shopifyTokenShape}', now(), now())`,
      );
      expect(message).toMatch(/commerce_connections_(secret_ref_shape|no_secret_values)/);
    });

    it("y tampoco un secreto escondido en otra columna de texto", async () => {
      for (const [column, value] of [
        ["notes", stripeKeyShape],
        ["shop_domain", `${HEX32}0123456789`],
        ["api_version", webhookSecretShape],
      ] as const) {
        const message = await sqlError(
          `insert into payload.commerce_connections (key, site_key, engine, status, secret_ref, ${column}, updated_at, created_at)
           values ('rig-token-${column}', 'courvia', 'native', 'draft', 'env:X', '${value}', now(), now())`,
        );
        expect(message, `columna ${column}`).not.toBe(NO_ERROR);
      }
    });

    it("el panel lo dice antes: la validación de Payload rechaza el mismo valor", async () => {
      const outcome = await rejection(() =>
        payload.create({
          collection: "commerce-connections",
          overrideAccess: true,
          data: {
            key: "rig-token-payload",
            siteKey: DEFAULT_SITE_KEY,
            engine: "shopify",
            status: "draft",
            secretRef: shopifyTokenShape,
          },
        }),
      );
      expect(outcome).toBeInstanceOf(Error);
      expect(describeError(outcome)).toMatch(/secreto|env:|vault:|Secret Ref/i);
    });

    it("el estado de una conexión no retrocede una vez verificada", async () => {
      const created = await payload.create({
        collection: "commerce-connections",
        overrideAccess: true,
        data: {
          key: "rig-escalera",
          siteKey: DEFAULT_SITE_KEY,
          engine: "native",
          status: "verified",
          secretRef: "env:DATABASE_URL",
        },
      });
      const id = Number(created.id);
      expect(await sqlError(`update payload.commerce_connections set status = 'active' where id = ${String(id)}`)).toBe(
        NO_ERROR,
      );
      expect(
        await sqlError(`update payload.commerce_connections set status = 'verified' where id = ${String(id)}`),
      ).toMatch(/commerce_status/);
      // Antes de verified sí se puede corregir: draft y configured son
      // configuración a medias, no un compromiso operativo.
      const draftConn = await payload.create({
        collection: "commerce-connections",
        overrideAccess: true,
        data: {
          key: "rig-borrador",
          siteKey: DEFAULT_SITE_KEY,
          engine: "native",
          status: "configured",
          secretRef: "env:DATABASE_URL",
        },
      });
      expect(
        await sqlError(
          `update payload.commerce_connections set status = 'draft' where id = ${String(Number(draftConn.id))}`,
        ),
      ).toBe(NO_ERROR);
    });

    it("una referencia de verdad sí entra", async () => {
      const created = await payload.create({
        collection: "commerce-connections",
        overrideAccess: true,
        data: {
          key: "rig-referencia",
          siteKey: DEFAULT_SITE_KEY,
          engine: "shopify",
          status: "draft",
          secretRef: "vault:courvia/shopify/admin-token",
        },
      });
      expect(created.secretRef).toBe("vault:courvia/shopify/admin-token");
    });
  });

  /* ================================================================== */
  /* 2 · El binding activo no se edita en sitio                         */
  /* ================================================================== */

  describe("el binding activo no se edita en sitio: se crea una revisión", () => {
    /*
     * GUARDARRAÍL ROTO A MANO (2): se hizo
     * `DROP TRIGGER commerce_bindings_freeze ON payload.commerce_bindings`.
     * El UPDATE crudo de abajo pasó y los dos primeros tests cayeron. Con el
     * trigger puesto, vuelven a verde.
     */
    it("cambiar la conexión del binding activo se rechaza en la base de datos", async () => {
      const message = await sqlError(
        `update payload.commerce_bindings set connection_id = ${String(legacyConnectionId)}
         where site_key = '${DEFAULT_SITE_KEY}' and status = 'active'`,
      );
      expect(message).toMatch(/commerce_immutable/);
    });

    it("subirle la revisión, también", async () => {
      const message = await sqlError(
        `update payload.commerce_bindings set revision = revision + 1
         where site_key = '${DEFAULT_SITE_KEY}' and status = 'active'`,
      );
      expect(message).toMatch(/commerce_immutable/);
    });

    it("y por la API de Payload el resultado es el mismo", async () => {
      const active = await payload.find({
        collection: "commerce-bindings",
        where: { siteKey: { equals: DEFAULT_SITE_KEY }, status: { equals: "active" } },
        limit: 1,
        overrideAccess: true,
      });
      const binding = active.docs[0];
      expect(binding).toBeDefined();
      const outcome = await rejection(() =>
        payload.update({
          collection: "commerce-bindings",
          id: binding?.id ?? 0,
          overrideAccess: true,
          data: { connection: legacyConnectionId },
        }),
      );
      expect(outcome).toBeInstanceOf(Error);
      expect(describeError(outcome)).toMatch(/commerce_immutable/);
    });

    it("no puede haber dos bindings activos para el mismo sitio", async () => {
      const message = await sqlError(
        `insert into payload.commerce_bindings (site_key, connection_id, revision, status, updated_at, created_at)
         values ('${DEFAULT_SITE_KEY}', ${String(legacyConnectionId)}, 901, 'active', now(), now())`,
      );
      expect(message).toMatch(/commerce_bindings_one_active_idx|duplicate key/);
    });

    it("un binding no puede apuntar a una conexión de otro sitio", async () => {
      const outcome = await rejection(() =>
        payload.create({
          collection: "commerce-bindings",
          overrideAccess: true,
          data: {
            siteKey: "rig-otro-sitio",
            connection: legacyConnectionId,
            revision: 902,
            status: "verified",
          },
        }),
      );
      expect(outcome).toBeInstanceOf(Error);
      expect(describeError(outcome)).toMatch(/commerce_binding/);
    });

    it("el estado solo avanza: de draining no se vuelve atrás", async () => {
      const created = await payload.create({
        collection: "commerce-bindings",
        overrideAccess: true,
        data: {
          siteKey: DEFAULT_SITE_KEY,
          connection: legacyConnectionId,
          revision: 905,
          status: "verified",
        },
      });
      // Adelante, sí.
      const drained = await payload.update({
        collection: "commerce-bindings",
        id: created.id,
        overrideAccess: true,
        data: { status: "draining" },
      });
      expect(drained.status).toBe("draining");
      // Atrás, no.
      const message = await sqlError(
        `update payload.commerce_bindings set status = 'verified' where id = ${String(Number(created.id))}`,
      );
      expect(message).toMatch(/commerce_status/);
    });

    it("una revisión nueva SÍ se puede crear, que es la mecánica prevista", async () => {
      const next = await payload.create({
        collection: "commerce-bindings",
        overrideAccess: true,
        data: {
          siteKey: DEFAULT_SITE_KEY,
          connection: legacyConnectionId,
          revision: 903,
          status: "verified",
        },
      });
      expect(next.revision).toBe(903);
      // Y no ha tocado a la activa.
      const active = await payload.find({
        collection: "commerce-bindings",
        where: { siteKey: { equals: DEFAULT_SITE_KEY }, status: { equals: "active" } },
        depth: 1,
        overrideAccess: true,
      });
      expect(active.totalDocs).toBe(1);
      expect(active.docs[0]?.connectionKey).toBe(NATIVE_CONNECTION_KEY);
    });

    it("un binding no puede estar activo sobre una conexión que no ha llegado a activa", async () => {
      const message = await sqlError(
        `insert into payload.commerce_bindings (site_key, connection_id, revision, status, updated_at, created_at)
         values ('rig-sitio-shopify', ${String(shopifyConnectionId)}, 904, 'active', now(), now())`,
      );
      // Falla por el sitio o por el estado de la conexión; las dos son el
      // mismo trigger y las dos impiden lo mismo: activar Shopify sin querer.
      expect(message).toMatch(/commerce_binding/);
    });
  });

  /* ================================================================== */
  /* 3 · Un pedido se opera por SU conexión                             */
  /* ================================================================== */

  describe("forOrder lee la fila, no lo que traiga quien llama", () => {
    /*
     * GUARDARRAÍL ROTO A MANO (3): en `container.ts`, `forOrder` se cambió
     * para devolver `runtimeFor(await findActiveOwner(payload, siteKey))` —es
     * decir, la conexión ACTIVA— en vez del dueño leído de la fila. El primer
     * test de este bloque cayó con
     *   expected 'native-primary' to be 'rig-legacy'
     * que es exactamente el fallo que ADR-029 existe para impedir.
     */
    it("un pedido de una conexión en draining se opera por ESA conexión", async () => {
      const { commerce } = await loadContainer();
      const runtime = await commerce.forOrder({
        kind: "order",
        engine: "native",
        connectionKey: LEGACY_KEY,
        externalId: String(legacyOrderId),
      });
      expect(runtime.owner.connectionKey).toBe(LEGACY_KEY);
      expect(runtime.owner.bindingRevision).toBe(LEGACY_REVISION);
      // Y no es la activa, que es lo que hace observable la diferencia.
      expect(runtime.owner.connectionKey).not.toBe(NATIVE_CONNECTION_KEY);
    });

    it("reclamar la conexión activa sobre un pedido ajeno se rechaza", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() =>
        commerce.forOrder({
          kind: "order",
          engine: "native",
          connectionKey: NATIVE_CONNECTION_KEY,
          externalId: String(legacyOrderId),
        }),
      );
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "owner_mismatch",
      );
    });

    it("un pedido que no existe no devuelve un motor cualquiera", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() =>
        commerce.forOrder({
          kind: "order",
          engine: "native",
          connectionKey: NATIVE_CONNECTION_KEY,
          externalId: "999999999",
        }),
      );
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "unknown_order",
      );
    });

    it("Shopify no está montado, aunque su conexión exista como fila", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() =>
        commerce.forOrder({
          kind: "order",
          engine: "shopify",
          connectionKey: SHOPIFY_KEY,
          externalId: "gid://shopify/Order/1",
        }),
      );
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "engine_not_configured",
      );
    });
  });

  /* ================================================================== */
  /* 4 · El dueño se escribe al crear y no se mueve                     */
  /* ================================================================== */

  describe("el dueño de una fila transaccional", () => {
    it("un pedido creado sin dueño hereda el binding ACTIVO", async () => {
      const row = await payload.findByID({
        collection: "orders",
        id: activeOrderId,
        depth: 0,
        overrideAccess: true,
      });
      expect(row.siteKey).toBe(DEFAULT_SITE_KEY);
      expect(row.engine).toBe("native");
      expect(row.connectionKey).toBe(NATIVE_CONNECTION_KEY);
      expect(row.bindingRevision).toBe(1);
    });

    /*
     * GUARDARRAÍL ROTO A MANO (4): se hizo
     * `DROP TRIGGER orders_freeze_owner ON payload.orders`. El UPDATE crudo
     * pasó y este test cayó. Repuesto el trigger, verde.
     */
    it("y después no se puede mover, ni con SQL crudo", async () => {
      const message = await sqlError(
        `update payload.orders set connection_key = '${LEGACY_KEY}' where id = ${String(activeOrderId)}`,
      );
      expect(message).toMatch(/commerce_immutable/);
    });

    it("un pedido sin conexión no cabe en la tabla", async () => {
      const message = await sqlError(
        `insert into payload.orders
           (status, market, email, total_amount, tax_amount, refunded_amount,
            shipping_address_name, shipping_address_line1, shipping_address_city,
            shipping_address_postal_code, shipping_address_country)
         values ('draft','es','${RIG_EMAIL}',1,0,0,'X','Y','Z','1','ES')`,
      );
      // Lo caza el trigger de coherencia antes que el NOT NULL, porque corre
      // BEFORE INSERT. Las dos barreras existen; esta es la que habla.
      expect(message).toMatch(/commerce_owner|null value in column/i);
    });

    it("y las cuatro columnas son NOT NULL en el catálogo, no solo de palabra", async () => {
      const rows = await query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
         where table_schema = 'payload' and table_name in ('orders','carts')
           and column_name in ('site_key','engine','connection_key','binding_revision')`,
      );
      expect(rows).toHaveLength(8);
      expect(rows.every((row) => row.is_nullable === "NO")).toBe(true);
    });

    it("y un dueño que miente sobre su conexión, tampoco", async () => {
      const message = await sqlError(
        `insert into payload.orders
           (status, market, email, total_amount, tax_amount, refunded_amount,
            shipping_address_name, shipping_address_line1, shipping_address_city,
            shipping_address_postal_code, shipping_address_country,
            site_key, engine, connection_key, binding_revision)
         values ('draft','es','${RIG_EMAIL}',1,0,0,'X','Y','Z','1','ES',
                 'courvia','shopify','${NATIVE_CONNECTION_KEY}',1)`,
      );
      expect(message).toMatch(/commerce_owner/);
    });

    it("borrar una conexión con pedidos vivos se rechaza", async () => {
      // Una conexión sin bindings, para que lo que hable sea la FK del pedido
      // y no el trigger de coherencia del binding.
      await query(
        `insert into payload.commerce_connections (key, site_key, engine, status, secret_ref, updated_at, created_at)
         values ('rig-fk', 'courvia', 'native', 'draining', 'env:DATABASE_URL', now(), now())`,
      );
      await query(
        `insert into payload.orders
           (status, market, email, total_amount, tax_amount, refunded_amount,
            shipping_address_name, shipping_address_line1, shipping_address_city,
            shipping_address_postal_code, shipping_address_country,
            site_key, engine, connection_key, binding_revision)
         values ('draft','es','${RIG_EMAIL}',1,0,0,'X','Y','Z','1','ES',
                 'courvia','native','rig-fk',3)`,
      );
      const message = await sqlError(
        "delete from payload.commerce_connections where key = 'rig-fk'",
      );
      expect(message).toMatch(/orders_connection_key_fk|violates foreign key/i);
    });
  });

  /* ================================================================== */
  /* 5 · El carrito, ya con dueño                                       */
  /* ================================================================== */

  describe("forCart lee la fila del carrito", () => {
    it("un carrito creado sin dueño hereda el binding activo", async () => {
      const { commerce } = await loadContainer();
      const runtime = await commerce.forCart(RIG_SESSION_ACTIVE);
      expect(runtime.owner.connectionKey).toBe(NATIVE_CONNECTION_KEY);
      expect(runtime.owner.bindingRevision).toBe(1);
    });

    it("y uno nacido en la conexión vieja se sigue sirviendo por ella", async () => {
      const { commerce } = await loadContainer();
      const runtime = await commerce.forCart(RIG_SESSION_LEGACY);
      expect(runtime.owner.connectionKey).toBe(LEGACY_KEY);
      expect(runtime.owner.bindingRevision).toBe(LEGACY_REVISION);
    });

    it("una sesión que no existe falla con nombre, no con la activa", async () => {
      const { commerce, CommerceRuntimeUnavailableError } = await loadContainer();
      const outcome = await rejection(() => commerce.forCart("rig-cart-inexistente"));
      expect(outcome).toBeInstanceOf(CommerceRuntimeUnavailableError);
      expect((outcome as InstanceType<typeof CommerceRuntimeUnavailableError>).problem).toBe(
        "cart_binding_unavailable",
      );
      expect(outcome).not.toHaveProperty("owner");
    });
  });

  /* ================================================================== */
  /* 6 · La clave editorial y las referencias de producto               */
  /* ================================================================== */

  describe("la identidad editorial de un producto", () => {
    it("no es el id ni el slug", () => {
      expect(productEditorialKey).not.toBe("");
      expect(productEditorialKey).not.toBe(String(productId));
      expect(productEditorialKey).not.toBe(RIG_PRODUCT_SLUG);
      expect(productEditorialKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("sobrevive a un cambio de slug", async () => {
      await payload.update({
        collection: "products",
        id: productId,
        overrideAccess: true,
        draft: false,
        data: { slug: RIG_PRODUCT_SLUG_2, _status: "published" },
      });
      const rows = await query<{ editorial_key: string; slug: string }>(
        `select editorial_key, slug from payload.products where id = ${String(productId)}`,
      );
      expect(rows[0]?.slug).toBe(RIG_PRODUCT_SLUG_2);
      expect(rows[0]?.editorial_key).toBe(productEditorialKey);
    });

    it("y no se puede reescribir", async () => {
      const message = await sqlError(
        `update payload.products set editorial_key = '00000000-0000-4000-8000-000000000000'
         where id = ${String(productId)}`,
      );
      expect(message).toMatch(/commerce_immutable/);
    });

    it("todos los productos que ya existían tienen una, y distintas", async () => {
      const rows = await query<{ total: number; claves: number }>(
        "select count(*)::int as total, count(distinct editorial_key)::int as claves from payload.products",
      );
      expect(rows[0]?.total).toBeGreaterThan(0);
      expect(rows[0]?.claves).toBe(rows[0]?.total);
    });
  });

  describe("una referencia de producto se une por GID, no por handle ni por SKU", () => {
    it("Shopify con un handle se rechaza", async () => {
      const message = await sqlError(
        `insert into payload.commerce_product_refs
           (product_id, connection_id, external_product_id, status, updated_at, created_at)
         values (${String(productId)}, ${String(shopifyConnectionId)}, 'tempo-r1', 'draft', now(), now())`,
      );
      expect(message).toMatch(/GID/);
    });

    it("y con un SKU también", async () => {
      const message = await sqlError(
        `insert into payload.commerce_product_refs
           (product_id, connection_id, external_product_id, status, updated_at, created_at)
         values (${String(productId)}, ${String(shopifyConnectionId)}, 'RLY-ST-P', 'draft', now(), now())`,
      );
      expect(message).toMatch(/GID/);
    });

    it("con el GID entra, y expone la clave editorial del producto", async () => {
      const created = await payload.create({
        collection: "commerce-product-refs",
        overrideAccess: true,
        depth: 1,
        data: {
          product: productId,
          connection: shopifyConnectionId,
          externalProductId: "gid://shopify/Product/1234567890",
          status: "draft",
        },
      });
      expect(created.editorialProductId).toBe(productEditorialKey);
      expect(created.engine).toBe("shopify");
      expect(created.connectionKey).toBe(SHOPIFY_KEY);
    });

    it("dos referencias al mismo producto externo en la misma conexión, no", async () => {
      const message = await sqlError(
        `insert into payload.commerce_product_refs
           (product_id, connection_id, external_product_id, status, updated_at, created_at)
         values (${String(productId)}, ${String(shopifyConnectionId)}, 'gid://shopify/Product/1234567890', 'draft', now(), now())`,
      );
      expect(message).toMatch(/commerce_product_refs_conn_|duplicate key/);
    });
  });

  /* ================================================================== */
  /* 7 · RLS: la cuarta capa, la que importa                            */
  /* ================================================================== */

  describe("las tablas nuevas nacen con RLS y sin políticas", () => {
    it("todas las tablas de payload tienen RLS activo", async () => {
      const rows = await query<{ rls_on: number; total: number }>(
        `select count(*) filter (where rowsecurity)::int as rls_on, count(*)::int as total
         from pg_tables where schemaname = 'payload'`,
      );
      expect(rows[0]?.rls_on).toBe(rows[0]?.total);
    });

    it("y ninguna política: RLS sin política es la denegación total", async () => {
      const rows = await query<{ n: number }>(
        "select count(*)::int as n from pg_policies where schemaname = 'payload'",
      );
      expect(rows[0]?.n).toBe(0);
    });

    it("las cuatro tablas de la Fase 2 están entre ellas", async () => {
      const rows = await query<{ tablename: string }>(
        `select tablename from pg_tables
         where schemaname = 'payload' and rowsecurity
           and tablename in ('commerce_connections','commerce_bindings','commerce_product_refs','carts')`,
      );
      expect(rows.map((row) => row.tablename).sort()).toEqual([
        "carts",
        "commerce_bindings",
        "commerce_connections",
        "commerce_product_refs",
      ]);
    });
  });
}
