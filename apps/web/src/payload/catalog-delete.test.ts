/**
 * Borrar catálogo con dependientes, contra un Postgres real y los hooks
 * reales de Payload.
 *
 * El esquema no defiende este caso: `variants.product_id` (y
 * `prices/inventory/orders_lines.variant_id`) son NOT NULL con FK
 * `ON DELETE SET NULL`, así que sin el hook borrar un producto con
 * variantes era un 23502 crudo delante del editor, y borrar una variante
 * vendida rompía contra la tabla financiera. Un mock que esconda la
 * transacción real no prueba nada de esto.
 *
 * Misma guarda que el resto de suites de integración: escribe y borra
 * filas, así que solo corre contra una base desechable (localhost o el
 * servicio efímero de CI).
 */
import type { BasePayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const SLUG = "cd-producto-test";
const SKU = "CD-TEST-P";

let payload: BasePayload;

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

/** Dependientes primero — exactamente el orden que los hooks exigen. */
async function cleanUp(): Promise<void> {
  const products = await payload.find({
    collection: "products",
    where: { slug: { equals: SLUG } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });
  for (const product of products.docs) {
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
    await payload.delete({ collection: "products", id: product.id, overrideAccess: true });
  }
}

describe.skipIf(!hasDb || !dbIsDisposable)("borrar catálogo con dependientes", () => {
  beforeAll(async () => {
    payload = await loadPayload();
    await cleanUp();
  });
  afterAll(cleanUp);

  async function createProductWithVariant(): Promise<{
    productId: number | string;
    variantId: number | string;
  }> {
    const product = await payload.create({
      collection: "products",
      locale: "es",
      draft: false,
      overrideAccess: true,
      data: {
        title: "Producto de borrado",
        slug: SLUG,
        sports: ["padel"],
        excerpt: "Fixture del test de borrado con dependientes. No es un producto.",
        specs: [],
        launchStatus: "available",
        _status: "published",
      },
    });
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: product.id, sku: SKU, sport: "padel", active: true },
    });
    return { productId: product.id, variantId: variant.id };
  }

  it("se niega a borrar un producto con variantes, nombrando los SKU", async () => {
    const { productId } = await createProductWithVariant();

    await expect(
      payload.delete({ collection: "products", id: productId, overrideAccess: true }),
    ).rejects.toThrow(new RegExp(SKU));

    // El producto sigue entero, no a medias: el 23502 que esto sustituye
    // dejaba la fila según le pillara.
    const still = await payload.findByID({
      collection: "products",
      id: productId,
      depth: 0,
      overrideAccess: true,
    });
    expect(still.slug).toBe(SLUG);
  });

  it("se niega a borrar una variante con precios o inventario, y sugiere desactivarla", async () => {
    const products = await payload.find({
      collection: "products",
      where: { slug: { equals: SLUG } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const variants = await payload.find({
      collection: "variants",
      where: { product: { equals: products.docs[0]!.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const variantId = variants.docs[0]!.id;
    await payload.create({
      collection: "prices",
      overrideAccess: true,
      data: { variant: variantId, market: "es", amount: 1000, taxBehavior: "inclusive", active: true },
    });
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variantId, qtyOnHand: 1, qtyCommitted: 0 },
    });

    await expect(
      payload.delete({ collection: "variants", id: variantId, overrideAccess: true }),
    ).rejects.toThrow(/active/);
  });

  it("sin dependientes, el borrado pasa — la puerta no está soldada", async () => {
    const products = await payload.find({
      collection: "products",
      where: { slug: { equals: SLUG } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const productId = products.docs[0]!.id;
    const variants = await payload.find({
      collection: "variants",
      where: { product: { equals: productId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    const variantIds = variants.docs.map((doc) => doc.id);
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

    // Primero las variantes (ya sin precios/inventario/pedidos), luego el
    // producto (ya sin variantes): las dos puertas se abren en orden.
    await payload.delete({
      collection: "variants",
      where: { id: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({ collection: "products", id: productId, overrideAccess: true });

    const gone = await payload.find({
      collection: "products",
      where: { slug: { equals: SLUG } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    expect(gone.totalDocs).toBe(0);
  });
});
