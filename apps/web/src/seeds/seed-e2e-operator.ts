/**
 * El escenario que el harness de navegador necesita para operar un pedido.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ES UN SCRIPT Y NO UN `beforeAll`
 * ---------------------------------------------------------------------------
 *
 * Playwright no puede usar la Local API de Payload: su cargador de ESM no
 * resuelve `next/cache` desde `src/payload/commerce-connections.ts` —medido,
 * `Cannot find module .../next/cache`—. Así que el escenario se monta en un
 * PROCESO aparte, el mismo runtime que ya usan las otras semillas, y el test
 * habla solo por HTTP. Que hable solo por HTTP es lo interesante: es la
 * misma puerta que usa una persona con el panel abierto.
 *
 * ---------------------------------------------------------------------------
 * UNA CONTRASEÑA ESCRITA EN EL REPO, Y LO QUE LA HACE ACEPTABLE
 * ---------------------------------------------------------------------------
 *
 * Este script crea un usuario con credenciales fijas. Eso es una puerta
 * trasera si llega a una base de datos de verdad, así que **se niega a correr
 * contra cualquier cosa que no sea Postgres local o el desechable de CI** —el
 * mismo guardarraíl que usan las suites de base de datos (`DATABASE_URL` a
 * `127.0.0.1`/`localhost`, o `CI=true`)—. Sin esa comprobación no se escribe.
 *
 * No hay ninguna clave de servicio aquí, ni se lee ninguna: el usuario se
 * crea por la Local API, que es la que existe precisamente para no necesitar
 * una sesión previa.
 *
 * Idempotente: si el operador ya está, se reutiliza; si el pedido de la
 * ejecución anterior sigue ahí, se borra y se rehace, porque el recorrido
 * empieza en `paid` y un pedido a medio entregar no serviría dos veces.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

/** Fijas y públicas a propósito: solo existen en bases de datos desechables. */
export const E2E_OPERATOR_EMAIL = "e2e-operator@courvia.test";
export const E2E_OPERATOR_PASSWORD = "e2e-operator-not-a-secret";
export const E2E_ORDER_EMAIL = "e2e-comprador@courvia.test";
const E2E_PRODUCT_SLUG = "e2e-walk-fixture";
const E2E_SKU = "E2E-WALK";
const E2E_CARRIER_CODE = "e2e-courier";

const url = process.env.DATABASE_URL ?? "";
const disposable = /@(127\.0\.0\.1|localhost)[:/]/.test(url) || process.env.CI === "true";
if (!disposable) {
  console.error(
    "seed:e2e-operator crea un usuario con contraseña fija y SOLO corre contra\n" +
      "Postgres local o el desechable de CI. DATABASE_URL no es ninguno de los dos.",
  );
  process.exit(1);
}

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

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

// --------------------------------------------------------------- el operador
const operatorId = await firstId("users", {
  email: { equals: E2E_OPERATOR_EMAIL },
});
if (operatorId === null) {
  await payload.create({
    collection: "users",
    overrideAccess: true,
    data: {
      email: E2E_OPERATOR_EMAIL,
      password: E2E_OPERATOR_PASSWORD,
      name: "Operador E2E",
      roles: ["admin"],
    },
  });
  console.log(`operador creado: ${E2E_OPERATOR_EMAIL}`);
} else {
  console.log(`operador ya existente: ${E2E_OPERATOR_EMAIL}`);
}

// ------------------------------------------------------------- el catálogo
let productId = await firstId("products", {
  slug: { equals: E2E_PRODUCT_SLUG },
});
productId ??= Number(
  (
    await payload.create({
      collection: "products",
      locale: "es",
      draft: false,
      overrideAccess: true,
      data: {
        title: "Banco de pruebas del recorrido",
        slug: E2E_PRODUCT_SLUG,
        sports: ["padel"],
        excerpt: "Fixture del recorrido de un pedido. No es un producto.",
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

let variantId = await firstId("variants", { sku: { equals: E2E_SKU } });
variantId ??= Number(
  (
    await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: productId, sku: E2E_SKU, sport: "padel", active: true },
    })
  ).id,
);

// ----------------------------------------------------------- el transportista
let carrierId = await firstId("carriers", {
  code: { equals: E2E_CARRIER_CODE },
});
carrierId ??= Number(
  (
    await payload.create({
      collection: "carriers",
      overrideAccess: true,
      data: {
        code: E2E_CARRIER_CODE,
        name: "Courier E2E",
        trackingUrlTemplate: "https://courier.e2e.test/track/{tracking}",
        markets: ["es"],
        active: true,
      } as never,
    })
  ).id,
);

// ------------------------------------------------------------------ el pedido
// Se rehace en cada ejecución: el recorrido empieza en `paid`, y un pedido
// que ya llegó a `delivered` no vuelve atrás.
const previousOrder = await firstId("orders", {
  email: { equals: E2E_ORDER_EMAIL },
});
if (previousOrder !== null) {
  await payload.delete({
    collection: "outbox",
    where: { order: { equals: previousOrder } },
    overrideAccess: true,
  });
  await payload.delete({
    collection: "shipments",
    where: { order: { equals: previousOrder } },
    overrideAccess: true,
  });
  await payload.delete({
    collection: "orders",
    id: previousOrder,
    overrideAccess: true,
  });
}

const order = await payload.create({
  collection: "orders",
  overrideAccess: true,
  data: {
    status: "paid",
    market: "es",
    email: E2E_ORDER_EMAIL,
    locale: "es",
    lines: [{ variant: variantId, sku: E2E_SKU, quantity: 1, unitAmount: 129_000 }],
    totalAmount: 129_000,
    taxAmount: 0,
    shippingAmount: 0,
    refundedAmount: 0,
    shippingAddress: {
      name: "Comprador E2E",
      line1: "Calle Uno 1",
      city: "Madrid",
      postalCode: "28001",
      country: "ES",
    },
  },
});

console.log(
  JSON.stringify({
    orderId: Number(order.id),
    carrierId,
    variantId,
    sku: E2E_SKU,
  }),
);
process.exit(0);
