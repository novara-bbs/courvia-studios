/**
 * A page cannot exist without an address, and the proof is the row.
 *
 * The bug this file locks down was not a wrong value, it was a row that
 * should never have been written: adding a starter to a brand-new page and
 * reaching for ⌘/Ctrl+S saved a draft with `slug = ''`. The storefront never
 * saw it (`get-page.ts` filters on `_status` and looks pages up by slug), the
 * admin list showed a blank Dirección, and the SECOND one came back as "El
 * valor debe ser único" on a field the editor had never typed in — because a
 * unique btree treats '' as a value. Omitting the key entirely was worse
 * still: `slug = NULL`, and NULLs never collide, so they accumulated.
 *
 * So every assertion here goes to Postgres, not to the return value of the
 * call: `payload.create` reporting a slug it never persisted is exactly the
 * failure mode a test written against the intention would miss. The counts
 * are read with SQL through the pool for the same reason — `payload.find`
 * cannot express "or the column is NULL" as bluntly as SQL can, and this is
 * the one assertion that has to be blunt.
 *
 * Same guard as the redirect suite: it writes and deletes rows, so it only
 * runs against a disposable database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Every slug this file may create, so teardown never guesses. */
const SLUGS = [
  "pagina-de-prueba-del-slug",
  "pagina-de-prueba-del-slug-2",
  "pagina-de-prueba-del-slug-3",
  "ps-a-mano",
  "ps-a-mano-2",
  "ps-renombrada",
];
const TITLE = "Página de prueba del slug";

let payload: BasePayload;

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

/** Raw SQL, on purpose: see the header. */
async function query<Row>(sql: string): Promise<Row[]> {
  const db = payload.db as unknown as { pool: { query: (text: string) => Promise<{ rows: Row[] }> } };
  const result = await db.pool.query(sql);
  return result.rows;
}

/** Rows with no usable address, counted in the table itself. */
async function addresslessRows(): Promise<number> {
  const rows = await query<{ n: number }>(
    "select count(*)::int as n from payload.pages where slug is null or slug = ''",
  );
  return rows[0]?.n ?? 0;
}

/** The slug as Postgres holds it — never the one the API echoed back. */
async function storedSlug(id: number | string): Promise<null | string> {
  const rows = await query<{ slug: null | string }>(
    `select slug from payload.pages where id = ${String(Number(id))}`,
  );
  return rows[0]?.slug ?? null;
}

/**
 * The slug of the LATEST VERSION, which is where a draft edit actually lands.
 *
 * `payload.pages` only moves when a document is published; a draft update
 * writes `payload._pages_v` and leaves the main row alone. Three of the cases
 * below were green against `pages.slug` while asserting nothing at all,
 * because the column they read is one the operation never touches.
 */
async function draftSlug(id: number | string): Promise<null | string> {
  const rows = await query<{ version_slug: null | string }>(
    `select version_slug from payload._pages_v
       where parent_id = ${String(Number(id))} and latest = true`,
  );
  return rows[0]?.version_slug ?? null;
}

async function cleanUp(): Promise<void> {
  await payload.delete({
    collection: "pages",
    where: { slug: { in: SLUGS } },
    overrideAccess: true,
  });
  // Anything this suite managed to write without an address. If the guard
  // ever regresses, teardown still leaves the database as it found it —
  // versions first, because `_pages_v.parent_id` is ON DELETE SET NULL and
  // a raw delete of the parent would leave orphan versions behind instead.
  await query(
    `delete from payload._pages_v
       where parent_id is null
          or parent_id in (select id from payload.pages where slug is null or slug = '')`,
  );
  await query("delete from payload.pages where slug is null or slug = ''");
}

/**
 * The exact shape of the request the panel sends behind ⌘/Ctrl+S on a page
 * that does not exist yet (@payloadcms/ui PublishButton `saveDraft`):
 * `draft: true`, `_status: 'draft'`, and whatever the form holds — which,
 * after one click on a starter, is a stack of blocks and nothing else.
 */
async function saveDraft(data: Record<string, unknown>): Promise<number | string> {
  const doc = await payload.create({
    collection: "pages",
    locale: "es",
    draft: true,
    overrideAccess: true,
    data: { blocks: [], _status: "draft", ...data } as never,
  });
  return doc.id;
}

/** Payload wraps a field validator's message; the sentence an editor reads
 *  lives in `error.data.errors[]`. Asserting on the wrapper would pass for a
 *  rejection for the wrong reason. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: { errors?: Array<{ message?: string; path?: string }> } }).data;
    return (data?.errors ?? []).map((entry) => `${entry.path ?? ""}: ${entry.message ?? ""}`).join(" · ");
  }
  throw new Error("expected the write to be refused, and it was accepted");
}

describe.skipIf(!hasDb || !dbIsDisposable)("a page never lands without an address", () => {
  beforeAll(async () => {
    payload = await loadPayload();
    await cleanUp();
  });

  beforeEach(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("refuses the draft a starter click plus ⌘S used to write, and writes no row", async () => {
    const before = await addresslessRows();

    const message = await rejection(
      saveDraft({
        title: "",
        slug: "",
        blocks: [{ blockType: "stage", level: "h1", heading: "Titular", blockName: "Portada" }],
      }),
    );

    // The empty field is named, and the one named first is the one the
    // editor can see: `title` is the first field of the first tab, `slug`
    // lives two tabs away.
    expect(message).toContain("title:");
    expect(message).toContain("slug:");
    expect(await addresslessRows()).toBe(before);
  });

  it("refuses it just as hard when the slug key is absent rather than empty", async () => {
    // The nastier half of the same bug: '' collides with itself on the
    // unique index and at least stopped at one, NULL never collides and
    // stacked up.
    const before = await addresslessRows();
    await rejection(saveDraft({ title: "" }));
    expect(await addresslessRows()).toBe(before);
  });

  it("derives the address from the title, accents folded", async () => {
    const id = await saveDraft({ title: TITLE });
    expect(await storedSlug(id)).toBe("pagina-de-prueba-del-slug");
  });

  it("counts up rather than colliding when two pages share a title", async () => {
    const first = await saveDraft({ title: TITLE });
    const second = await saveDraft({ title: TITLE });
    const third = await saveDraft({ title: TITLE });

    expect([await storedSlug(first), await storedSlug(second), await storedSlug(third)]).toEqual([
      "pagina-de-prueba-del-slug",
      "pagina-de-prueba-del-slug-2",
      "pagina-de-prueba-del-slug-3",
    ]);
  });

  it("never overwrites an address the editor typed", async () => {
    const id = await saveDraft({ title: TITLE, slug: "ps-a-mano" });
    expect(await storedSlug(id)).toBe("ps-a-mano");
  });

  it("keeps a live address when the title changes under it", async () => {
    // The rule that keeps derivation from becoming a URL that moves on its
    // own — and, one hook further, a redirect nobody asked for.
    const id = await saveDraft({ title: TITLE });
    await payload.update({
      collection: "pages",
      id,
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { title: "Otro título completamente distinto", _status: "draft" },
    });
    expect(await draftSlug(id)).toBe("pagina-de-prueba-del-slug");
    expect(await storedSlug(id)).toBe("pagina-de-prueba-del-slug");
  });

  it("restores the address rather than clearing it when the field arrives empty", async () => {
    const id = await saveDraft({ title: TITLE, slug: "ps-a-mano" });
    await payload.update({
      collection: "pages",
      id,
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { slug: "", _status: "draft" },
    });
    expect(await draftSlug(id)).toBe("ps-a-mano");
  });

  it("still lets an editor move a page on purpose", async () => {
    const id = await saveDraft({ title: TITLE, slug: "ps-a-mano" });
    await payload.update({
      collection: "pages",
      id,
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { slug: "ps-renombrada", _status: "draft" },
    });
    expect(await draftSlug(id)).toBe("ps-renombrada");

    // And publishing is what carries it to the row the storefront reads.
    await payload.update({
      collection: "pages",
      id,
      locale: "es",
      draft: false,
      overrideAccess: true,
      data: { _status: "published" },
    });
    expect(await storedSlug(id)).toBe("ps-renombrada");
  });

  it("duplicates a page into an address a URL can actually hold", async () => {
    // The panel's Duplicate button is the whole point of the three seeded
    // templates. Payload's default for a unique text field appends " - Copy",
    // which this field's own validation refuses — so the button answered with
    // a kebab-case complaint about a slug nobody had written.
    const id = await saveDraft({ title: TITLE, slug: "ps-a-mano" });
    const copy = await payload.duplicate({
      collection: "pages",
      id,
      locale: "es",
      overrideAccess: true,
    });
    expect(await storedSlug(copy.id)).toBe("ps-a-mano-2");
  });

  it("refuses a title that cannot become a Latin URL, instead of inventing one", async () => {
    // The slug is not localized: there is no honest `robots-de-padel` to
    // derive from Arabic prose, so the editor is asked for one.
    const message = await rejection(saveDraft({ title: "الروبوتات" }));
    expect(message).toContain("slug:");
    expect(await addresslessRows()).toBe(0);
  });
});
