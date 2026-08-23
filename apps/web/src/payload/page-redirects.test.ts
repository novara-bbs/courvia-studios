/**
 * Renaming a page, against a real Postgres through the real Payload hooks.
 *
 * Nothing here is a unit test of a pure function: the whole value of the
 * feature is that the hook fires inside Payload's own transaction, with its
 * own validation running against the state that transaction can see. Mock
 * that away and the test proves nothing about the one thing that can break.
 *
 * Same guard as the commerce contract suite: it writes and deletes rows, so
 * it only runs against a disposable database (localhost, or CI's throwaway
 * service). CI sets DATABASE_URL, so it runs there.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";

/** Every slug this file may create, so teardown never guesses. */
const SLUGS = ["rt-uno", "rt-dos", "rt-tres", "rt-manual"];
const PATHS = SLUGS.map((slug) => `/${slug}`);

let payload: BasePayload;

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function cleanUp(): Promise<void> {
  await payload.delete({
    collection: "redirects",
    where: { or: [{ from: { in: PATHS } }, { to: { in: PATHS } }] },
    overrideAccess: true,
  });
  await payload.delete({
    collection: "pages",
    where: { slug: { in: SLUGS } },
    overrideAccess: true,
  });
}

async function createPublishedPage(slug: string): Promise<number | string> {
  const doc = await payload.create({
    collection: "pages",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: { title: `Página ${slug}`, slug, blocks: [], _status: "published" },
  });
  return doc.id;
}

async function rename(id: number | string, slug: string): Promise<void> {
  await payload.update({
    collection: "pages",
    id,
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: { slug, _status: "published" },
  });
}

async function redirectsFor(): Promise<
  Array<{ from: string; to: string; code: string; source: string }>
> {
  const result = await payload.find({
    collection: "redirects",
    where: { or: [{ from: { in: PATHS } }, { to: { in: PATHS } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
    sort: "from",
  });
  return result.docs.map((doc) => ({
    from: doc.from,
    to: doc.to,
    code: doc.code,
    source: doc.source,
  }));
}

describe.skipIf(!hasDb || !dbIsDisposable)("renaming a page writes its own redirect", () => {
  beforeAll(async () => {
    payload = await loadPayload();
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("creates /old → /new, permanent, marked as automatic", async () => {
    const id = await createPublishedPage("rt-uno");
    await rename(id, "rt-dos");

    expect(await redirectsFor()).toEqual([
      { from: "/rt-uno", to: "/rt-dos", code: "301", source: "slug-change" },
    ]);
    await cleanUp();
  });

  it("renaming twice leaves A→C and B→C, never a chain", async () => {
    const id = await createPublishedPage("rt-uno");
    await rename(id, "rt-dos");
    await rename(id, "rt-tres");

    // The point: /rt-uno must not still say /rt-dos. A chain costs every
    // visitor a second round trip and breaks outright if /rt-dos is reused.
    expect(await redirectsFor()).toEqual([
      { from: "/rt-dos", to: "/rt-tres", code: "301", source: "slug-change" },
      { from: "/rt-uno", to: "/rt-tres", code: "301", source: "slug-change" },
    ]);
    await cleanUp();
  });

  it("renaming back drops the rule that would shadow the page", async () => {
    const id = await createPublishedPage("rt-uno");
    await rename(id, "rt-dos");
    await rename(id, "rt-uno");

    // /rt-uno is a live page again, so the /rt-uno → /rt-dos rule is gone;
    // what remains points the other way.
    expect(await redirectsFor()).toEqual([
      { from: "/rt-dos", to: "/rt-uno", code: "301", source: "slug-change" },
    ]);
    await cleanUp();
  });

  it("writes nothing for a slug that was never published", async () => {
    const doc = await payload.create({
      collection: "pages",
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { title: "Borrador", slug: "rt-uno", blocks: [], _status: "draft" },
    });
    await payload.update({
      collection: "pages",
      id: doc.id,
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { slug: "rt-dos", _status: "draft" },
    });

    // A URL nobody could visit needs no forwarding address, and rules for
    // URLs that never existed are how a redirect list stops being read.
    expect(await redirectsFor()).toEqual([]);
    await cleanUp();
  });
});

/**
 * Payload wraps a field validator's message: `error.message` is only "The
 * following field is invalid: From", and the sentence an editor actually
 * reads lives in `error.data.errors[].message`. Asserting on the wrapper
 * would pass for ANY rejection of that field, including a rejection for the
 * wrong reason.
 */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: { errors?: Array<{ message?: string }> } }).data;
    return data?.errors?.map((entry) => entry.message ?? "").join(" · ") ?? String(error);
  }
  throw new Error("expected the write to be refused, and it was accepted");
}

describe.skipIf(!hasDb || !dbIsDisposable)("a redirect an editor writes by hand", () => {
  beforeAll(async () => {
    payload = await loadPayload();
  });

  // Per test, not per suite: a case that fails mid-way must not leave a row
  // that makes the NEXT case fail for an unrelated reason.
  beforeEach(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  const create = (data: Record<string, unknown>) =>
    payload.create({
      collection: "redirects",
      overrideAccess: true,
      data: data as never,
    });

  it("refuses the obvious loop", async () => {
    expect(await rejectionMessage(create({ from: "/rt-uno", to: "/rt-uno", code: "301" }))).toMatch(
      /bucle/i,
    );
  });

  it("refuses the loop one row away", async () => {
    await create({ from: "/rt-uno", to: "/rt-dos", code: "301" });
    expect(await rejectionMessage(create({ from: "/rt-dos", to: "/rt-uno", code: "301" }))).toMatch(
      /bucle/i,
    );
  });

  it("refuses a source that a published page already occupies", async () => {
    await createPublishedPage("rt-manual");
    expect(
      await rejectionMessage(create({ from: "/rt-manual", to: "/rt-uno", code: "301" })),
    ).toMatch(/publicada/i);
  });

  it("refuses a source that a route in the code serves", async () => {
    expect(await rejectionMessage(create({ from: "/robots", to: "/rt-uno", code: "301" }))).toMatch(
      /código/i,
    );
  });

  it("refuses a destination that leaves the site", async () => {
    // Protocol-relative: looks like a path, lands on someone else's domain.
    expect(
      await rejectionMessage(create({ from: "/rt-uno", to: "//evil.example", code: "301" })),
    ).toMatch(/interno/i);
    expect(
      await rejectionMessage(create({ from: "/rt-uno", to: "https://evil.example", code: "301" })),
    ).toMatch(/interno/i);
  });

  it("accepts a plain one, and only 301 or 302", async () => {
    const doc = await create({ from: "/rt-uno", to: "/rt-dos", code: "302" });
    expect(doc.code).toBe("302");
    // 307 is not in the enum: the column type refuses it, not a comment.
    await expect(create({ from: "/rt-tres", to: "/rt-dos", code: "307" })).rejects.toThrow();
  });
});

/**
 * Lo mismo para el catálogo, que hasta el 23 ago 2026 no lo tenía.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ERA PEOR QUE EN `pages`, Y POR QUÉ SE VOLVIÓ PEOR AÚN
 * ---------------------------------------------------------------------------
 *
 * `redirectOnSlugChange` existía, estaba probado y estaba cableado **solo en
 * `pages`**. Renombrar un producto publicado dejaba su URL anterior sin regla.
 * Y desde ADR-026 el proxy sirve **404 reales**: lo que antes habría sido una
 * redirección ausente pasó a ser una puerta cerrada en la dirección que Google
 * tenía indexada, que es de lo poco que un catálogo no se puede permitir.
 *
 * ---------------------------------------------------------------------------
 * LA PARTE QUE NO ERA CABLEAR
 * ---------------------------------------------------------------------------
 *
 * Dos cosas no salían gratis, y las dos se comprueban abajo:
 *
 *  1. **El prefijo.** Un producto vive en `/robots/{slug}` y una categoría en
 *     `/c/{slug}`, no en la raíz de la región. Sin prefijo la regla se habría
 *     escrito para una URL que no existe.
 *  2. **La validación de `redirects` lo rechazaba.** `isReservedPath` sin
 *     manifiesto contesta «reservada» a CUALQUIER `/robots/x`, así que la
 *     regla no se podía ni crear: la validación protegía una URL que acababa
 *     de dejar de existir.
 */
describe.skipIf(!hasDb || !dbIsDisposable)(
  "renombrar en el catálogo escribe su redirección",
  () => {
    const PRODUCT_SLUGS = ["rt-robot-uno", "rt-robot-dos"];
    const CATEGORY_SLUGS = ["rt-cat-uno", "rt-cat-dos"];
    const CATALOG_PATHS = [
      ...PRODUCT_SLUGS.map((slug) => `/robots/${slug}`),
      ...CATEGORY_SLUGS.map((slug) => `/c/${slug}`),
    ];

    async function purge(): Promise<void> {
      await payload.delete({
        collection: "redirects",
        where: { or: [{ from: { in: CATALOG_PATHS } }, { to: { in: CATALOG_PATHS } }] },
        overrideAccess: true,
      });
      await payload.delete({
        collection: "products",
        where: { slug: { in: PRODUCT_SLUGS } },
        overrideAccess: true,
      });
      await payload.delete({
        collection: "categories",
        where: { slug: { in: CATEGORY_SLUGS } },
        overrideAccess: true,
      });
    }

    async function rulesFor(): Promise<{ from: string; to: string; source: string }[]> {
      const result = await payload.find({
        collection: "redirects",
        where: { from: { in: CATALOG_PATHS } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
        sort: "from",
      });
      return result.docs.map((doc) => ({ from: doc.from, to: doc.to, source: doc.source }));
    }

    beforeAll(async () => {
      payload = await loadPayload();
      await purge();
    });

    afterAll(purge);
    beforeEach(purge);

    it("un producto publicado que se renombra deja /robots/viejo → /robots/nuevo", async () => {
      const created = await payload.create({
        collection: "products",
        locale: "es",
        draft: false,
        overrideAccess: true,
        data: {
          title: "Robot de prueba",
          slug: PRODUCT_SLUGS[0]!,
          editorialKey: "rt-robot-editorial",
          sports: ["padel"],
          _status: "published",
        } as never,
      });

      await payload.update({
        collection: "products",
        id: created.id,
        locale: "es",
        draft: false,
        overrideAccess: true,
        data: { slug: PRODUCT_SLUGS[1]!, _status: "published" } as never,
      });

      expect(
        await rulesFor(),
        "renombrar un producto indexado dejó su URL anterior en un 404 duro",
      ).toEqual([
        {
          from: `/robots/${PRODUCT_SLUGS[0]!}`,
          to: `/robots/${PRODUCT_SLUGS[1]!}`,
          source: "slug-change",
        },
      ]);
    });

    it("y un producto en BORRADOR no escribe ninguna: esa URL nunca existió", async () => {
      const created = await payload.create({
        collection: "products",
        locale: "es",
        draft: true,
        overrideAccess: true,
        data: {
          title: "Robot en borrador",
          slug: PRODUCT_SLUGS[0]!,
          editorialKey: "rt-robot-borrador",
          sports: ["padel"],
          _status: "draft",
        } as never,
      });

      await payload.update({
        collection: "products",
        id: created.id,
        locale: "es",
        draft: true,
        overrideAccess: true,
        data: { slug: PRODUCT_SLUGS[1]!, _status: "draft" } as never,
      });

      // El autoguardado del panel dispara cada 375 ms mientras alguien escribe:
      // una regla por pulsación llenaría la tabla de URLs que nadie visitó nunca.
      expect(await rulesFor()).toEqual([]);
    });

    it("una categoría también, aunque no tenga borradores", async () => {
      // `categories` no lleva `_status`. Si `publishedSlug` tratara esa ausencia
      // como «no publicado», esto se quedaría vacío en silencio.
      const created = await payload.create({
        collection: "categories",
        locale: "es",
        overrideAccess: true,
        data: { title: "Categoría de prueba", slug: CATEGORY_SLUGS[0]! } as never,
      });

      await payload.update({
        collection: "categories",
        id: created.id,
        locale: "es",
        overrideAccess: true,
        data: { slug: CATEGORY_SLUGS[1]! } as never,
      });

      expect(await rulesFor()).toEqual([
        { from: `/c/${CATEGORY_SLUGS[0]!}`, to: `/c/${CATEGORY_SLUGS[1]!}`, source: "slug-change" },
      ]);
    });

    it("y la validación sigue protegiendo un producto VIVO", async () => {
      // La otra mitad del cambio. Aflojar `isReservedPath` para que la regla del
      // renombrado se pueda escribir no puede convertirse en «cualquier URL de
      // producto se puede tapar»: la que tiene documento publicado detrás sigue
      // ganando.
      await payload.create({
        collection: "products",
        locale: "es",
        draft: false,
        overrideAccess: true,
        data: {
          title: "Robot vivo",
          slug: PRODUCT_SLUGS[0]!,
          editorialKey: "rt-robot-vivo",
          sports: ["padel"],
          _status: "published",
        } as never,
      });

      await expect(
        payload.create({
          collection: "redirects",
          overrideAccess: true,
          data: { from: `/robots/${PRODUCT_SLUGS[0]!}`, to: "/robots/otro", code: "301" } as never,
        }),
      ).rejects.toThrow();
    });
  },
);
