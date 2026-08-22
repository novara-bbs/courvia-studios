/**
 * Permissions, EXERCISED.
 *
 * A test that reads a collection's `access` object and asserts it points at
 * `isAdmin` proves that somebody wrote `isAdmin` there. It does not prove
 * that an editor is stopped, and it keeps passing when the field that
 * matters was never covered — which is exactly how `orders.status` spent its
 * life carrying the description "only the state machine moves this" while
 * remaining writable through the API.
 *
 * So every claim below is made by DOING the thing: a real editor account in
 * a real Postgres, writing through the Local API with `overrideAccess: false`
 * so the same access chain the panel and REST use is the one being tested.
 * The accounts are created in `beforeAll` and deleted in `afterAll`.
 *
 * Same guard as the other DB suites: it creates and deletes rows, so it only
 * runs against a disposable database (localhost, or CI's throwaway service).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BasePayload, TypeWithID } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const EDITOR_EMAIL = "acl-editor@courvia.test";
const ADMIN_EMAIL = "acl-admin@courvia.test";
const PASSWORD = "Acl-Test-2026!";
const PRODUCT_SLUG = "acl-test-rig";
const SKU = "ACL-RIG-P";

/** A 1×1 PNG, so the media fixture is a real upload and not a mocked row. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let payload: BasePayload;
let editor: TypeWithID;
let admin: TypeWithID;
let productId: number;
let variantId: number;
let priceId: number;
let mediaId: number;

/** What Payload throws when access says no, whatever the wording. */
async function refused(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  throw new Error("La operación NO fue rechazada: el permiso no está puesto.");
}

async function cleanUp(): Promise<void> {
  await payload.delete({
    collection: "users",
    where: { email: { in: [EDITOR_EMAIL, ADMIN_EMAIL] } },
    overrideAccess: true,
  });
  const products = await payload.find({
    collection: "products",
    where: { slug: { equals: PRODUCT_SLUG } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
    select: {},
  });
  const ids = products.docs.map((doc) => Number(doc.id));
  if (ids.length > 0) {
    const variants = await payload.find({
      collection: "variants",
      where: { product: { in: ids } },
      limit: 50,
      depth: 0,
      overrideAccess: true,
      select: {},
    });
    const variantIds = variants.docs.map((doc) => Number(doc.id));
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
    await payload.delete({ collection: "products", where: { id: { in: ids } }, overrideAccess: true });
  }
  await payload.delete({
    collection: "pages",
    where: { slug: { like: "acl-test-" } },
    overrideAccess: true,
  });
  await payload.delete({
    collection: "media",
    where: { alt: { like: "ACL fixture" } },
    overrideAccess: true,
  });
}

if (hasDb && dbIsDisposable) {
  beforeAll(async () => {
    const { getPayload } = await import("payload");
    const { default: config } = await import("@payload-config");
    payload = await getPayload({ config });
    await cleanUp();

    editor = (await payload.create({
      collection: "users",
      overrideAccess: true,
      data: { email: EDITOR_EMAIL, password: PASSWORD, name: "Editor de prueba", roles: ["editor"] },
    })) as unknown as TypeWithID;
    admin = (await payload.create({
      collection: "users",
      overrideAccess: true,
      data: { email: ADMIN_EMAIL, password: PASSWORD, name: "Admin de prueba", roles: ["admin"] },
    })) as unknown as TypeWithID;

    const product = await payload.create({
      collection: "products",
      overrideAccess: true,
      data: {
        title: "Banco de pruebas ACL",
        slug: PRODUCT_SLUG,
        sports: ["padel"],
        launchStatus: "available",
        _status: "published",
      },
    });
    productId = Number(product.id);
    const variant = await payload.create({
      collection: "variants",
      overrideAccess: true,
      data: { product: productId, sku: SKU, sport: "padel", active: true },
    });
    variantId = Number(variant.id);
    const price = await payload.create({
      collection: "prices",
      overrideAccess: true,
      data: { variant: variantId, market: "es", amount: 129_000, taxBehavior: "inclusive", active: true },
    });
    priceId = Number(price.id);

    const dir = mkdtempSync(path.join(tmpdir(), "acl-media-"));
    const file = path.join(dir, "acl-fixture.png");
    writeFileSync(file, PNG);
    const media = await payload.create({
      collection: "media",
      locale: "es",
      overrideAccess: true,
      filePath: file,
      data: { alt: "ACL fixture", evidenceStatus: "concept" },
    });
    mediaId = Number(media.id);
  });

  afterAll(async () => {
    await cleanUp();
  });

  describe("un editor no puede tocar el dinero ni el catálogo vendible", () => {
    it("no crea precios", async () => {
      const message = await refused(() =>
        payload.create({
          collection: "prices",
          user: editor,
          overrideAccess: false,
          data: { variant: variantId, market: "uk", amount: 1, taxBehavior: "inclusive" },
        }),
      );
      expect(message).toMatch(/Forbidden|no tienes permiso|not allowed/i);
    });

    it("no cambia un precio existente", async () => {
      await refused(() =>
        payload.update({
          collection: "prices",
          id: priceId,
          user: editor,
          overrideAccess: false,
          data: { amount: 1 },
        }),
      );
      const after = await payload.findByID({
        collection: "prices",
        id: priceId,
        depth: 0,
        overrideAccess: true,
      });
      expect(after.amount).toBe(129_000);
    });

    it("no crea existencias", async () => {
      await refused(() =>
        payload.create({
          collection: "inventory",
          user: editor,
          overrideAccess: false,
          data: { variant: variantId, qtyOnHand: 99, qtyCommitted: 0 },
        }),
      );
    });

    it("no crea ni renombra un SKU", async () => {
      await refused(() =>
        payload.create({
          collection: "variants",
          user: editor,
          overrideAccess: false,
          data: { product: productId, sku: "ACL-RIG-T", sport: "tenis" },
        }),
      );
      await refused(() =>
        payload.update({
          collection: "variants",
          id: variantId,
          user: editor,
          overrideAccess: false,
          data: { sku: "ACL-RENOMBRADO" },
        }),
      );
      const after = await payload.findByID({
        collection: "variants",
        id: variantId,
        depth: 0,
        overrideAccess: true,
      });
      expect(after.sku).toBe(SKU);
    });

    it("no borra un medio, y el medio sigue ahí", async () => {
      const message = await refused(() =>
        payload.delete({ collection: "media", id: mediaId, user: editor, overrideAccess: false }),
      );
      expect(message).toMatch(/Forbidden|no tienes permiso|not allowed/i);
      const still = await payload.findByID({
        collection: "media",
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      });
      expect(still.id).toBe(mediaId);
    });
  });

  describe("un editor conserva su oficio", () => {
    it("crea y publica una página", async () => {
      const page = await payload.create({
        collection: "pages",
        user: editor,
        overrideAccess: false,
        data: { title: "Página de prueba ACL", slug: "acl-test-pagina", _status: "published" },
      });
      expect(page.slug).toBe("acl-test-pagina");
      // The slug moved into an unnamed tab; it must still be a top-level path.
      expect(page).toHaveProperty("slug");
    });

    it("publica un producto y le escribe el alt a una imagen", async () => {
      const updated = await payload.update({
        collection: "products",
        id: productId,
        user: editor,
        overrideAccess: false,
        data: { excerpt: "Un texto que sí es suyo.", _status: "published" },
      });
      expect(updated.excerpt).toBe("Un texto que sí es suyo.");

      const media = await payload.update({
        collection: "media",
        id: mediaId,
        locale: "es",
        user: editor,
        overrideAccess: false,
        data: { alt: "ACL fixture reescrito" },
      });
      expect(media.alt).toBe("ACL fixture reescrito");
    });
  });

  describe("orders.status no se escribe desde fuera de la máquina de estados", () => {
    async function draftOrder(): Promise<number> {
      const order = await payload.create({
        collection: "orders",
        overrideAccess: true,
        data: {
          status: "pending_payment",
          market: "es",
          email: "acl-order@courvia.test",
          lines: [{ variant: variantId, sku: SKU, quantity: 1, unitAmount: 129_000 }],
          totalAmount: 129_000,
          taxAmount: 0,
          shippingAmount: 0,
          refundedAmount: 0,
          shippingAddress: {
            name: "Prueba ACL",
            line1: "Calle Uno 1",
            city: "Madrid",
            postalCode: "28001",
            country: "ES",
          },
        },
      });
      return Number(order.id);
    }

    it("un ADMIN no lo mueve por la API: el campo se descarta y el pedido no cambia", async () => {
      const id = await draftOrder();
      // Field access denies rather than throws: Payload drops the field and
      // saves the rest, which is why asserting "it threw" would be wrong and
      // asserting the stored value is the only thing that proves anything.
      await payload.update({
        collection: "orders",
        id,
        user: admin,
        overrideAccess: false,
        data: { status: "paid", locale: "es" },
      });
      const after = await payload.findByID({
        collection: "orders",
        id,
        depth: 0,
        overrideAccess: true,
      });
      expect(after.status).toBe("pending_payment");
      // The rest of the same write went through, so this is a field-level
      // denial and not a collection-level one that would break the backoffice.
      expect(after.locale).toBe("es");
      await payload.delete({ collection: "orders", id, overrideAccess: true });
    });

    it("la máquina de estados sí lo mueve (overrideAccess), o el arreglo habría roto el dominio", async () => {
      const id = await draftOrder();
      await payload.update({
        collection: "orders",
        id,
        overrideAccess: true,
        data: { status: "paid" },
      });
      const after = await payload.findByID({
        collection: "orders",
        id,
        depth: 0,
        overrideAccess: true,
      });
      expect(after.status).toBe("paid");
      await payload.delete({ collection: "orders", id, overrideAccess: true });
    });
  });

  describe("los títulos que eran números", () => {
    it("un precio se identifica por su SKU, sin columna nueva", async () => {
      const price = await payload.findByID({
        collection: "prices",
        id: priceId,
        depth: 0,
        overrideAccess: true,
      });
      expect(price.sku).toBe(SKU);
    });
  });
} else {
  it.skip("permissions suite (needs a disposable DATABASE_URL)", () => {});
}
