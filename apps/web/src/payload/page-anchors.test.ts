/**
 * An index that points nowhere must not become a published page.
 *
 * `anchorNav` stores a bare fragment per row; the renderer emits
 * `href="#<fragment>"` and derives the target id from another block's Payload
 * Block Name with `anchorId`. Nothing compared the two. An index pointing at
 * `especificaciones` while the target block is called «Specs» published
 * green, rendered a link and did nothing when clicked — the least
 * diagnosable failure in the CMS, because every layer involved is behaving
 * correctly.
 *
 * Two things this file has to prove, and one it has to prove does NOT
 * happen:
 *
 *   - Publishing a page whose index points at a name no block carries is
 *     refused, and the refusal names the anchors that DO exist.
 *   - Publishing the same page with a correct anchor goes through.
 *   - Saving a DRAFT with a broken anchor is accepted. That is the decision
 *     recorded in pages.ts: a collection `beforeValidate` runs on autosave
 *     too, every 375 ms, so a hook that threw there would refuse the save and
 *     lose the editor's work over a link nobody outside the panel can click
 *     yet. Building the page IS the inconsistent state.
 *
 * Every assertion goes to Postgres rather than to the return value of the
 * call, for the reason page-slug.test.ts spells out: a draft update does not
 * write `payload.pages`, it writes `payload._pages_v`, and three cases in
 * that file were once green while asserting nothing at all.
 *
 * Writes and deletes rows, so it only runs against a disposable database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const SLUG = "pagina-de-prueba-de-anclas";
const TITLE = "Página de prueba de anclas";

let payload: BasePayload;

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function query<Row>(sql: string): Promise<Row[]> {
  const db = payload.db as unknown as {
    pool: { query: (text: string) => Promise<{ rows: Row[] }> };
  };
  const result = await db.pool.query(sql);
  return result.rows;
}

/** The status Postgres holds for the main row — never the one the API
 *  echoed back. `null` when the page is not in `payload.pages` at all. */
async function storedStatus(id: number | string): Promise<null | string> {
  const rows = await query<{ _status: null | string }>(
    `select _status from payload.pages where id = ${String(Number(id))}`,
  );
  return rows[0]?._status ?? null;
}

/**
 * The anchor stored on the first index row of the LATEST VERSION, which is
 * where a draft edit actually lands.
 *
 * Three tables, not one: Payload gives every block its own table and every
 * array inside it another, so the row hangs off
 * `_pages_v_blocks_anchor_nav` which hangs off `_pages_v`. Reading it any
 * shallower returns nothing and the assertion becomes decorative — which is
 * exactly how this helper failed the first time it ran.
 */
async function draftAnchor(id: number | string): Promise<null | string> {
  const rows = await query<{ anchor: null | string }>(
    `select i.anchor
       from payload._pages_v_blocks_anchor_nav_items i
       join payload._pages_v_blocks_anchor_nav b on b.id = i._parent_id
       join payload._pages_v v on v.id = b._parent_id
      where v.parent_id = ${String(Number(id))} and v.latest = true
      order by i._order
      limit 1`,
  );
  return rows[0]?.anchor ?? null;
}

async function cleanUp(): Promise<void> {
  await payload.delete({
    collection: "pages",
    where: { slug: { equals: SLUG } },
    overrideAccess: true,
  });
  await query("delete from payload._pages_v where parent_id is null");
}

/** Payload wraps a validator's message; the sentence an editor reads lives in
 *  `error.data.errors[]`. Asserting on the wrapper would pass for a rejection
 *  for the wrong reason. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: { errors?: { message?: string; path?: string }[] } }).data;
    return (data?.errors ?? [])
      .map((entry) => `${entry.path ?? ""}: ${entry.message ?? ""}`)
      .join(" · ");
  }
  throw new Error("expected the write to be refused, and it was accepted");
}

/** A page with one named block and one index pointing at `anchor`. */
function pageWith(anchor: string, blockName: null | string = "Especificaciones") {
  return {
    title: TITLE,
    slug: SLUG,
    blocks: [
      {
        blockType: "anchorNav",
        items: [
          { text: "Especificaciones", anchor },
          { text: "Servicio", anchor },
        ],
      },
      {
        blockType: "stage",
        level: "h2",
        heading: "Las cifras",
        ...(blockName === null ? {} : { blockName }),
      },
    ],
  };
}

async function saveDraft(data: Record<string, unknown>): Promise<number | string> {
  const doc = await payload.create({
    collection: "pages",
    locale: "es",
    draft: true,
    overrideAccess: true,
    data: { _status: "draft", ...data } as never,
  });
  return doc.id;
}

async function publish(id: number | string): Promise<unknown> {
  return payload.update({
    collection: "pages",
    id,
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: { _status: "published" },
  });
}

describe.skipIf(!hasDb || !dbIsDisposable)("a page index never publishes pointing nowhere", () => {
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

  it("refuses to publish an index aimed at a block name nothing carries", async () => {
    // «Especificaciones» is the block name; the editor wrote the word they
    // had in mind for the section instead of the anchor derived from it.
    const id = await saveDraft(pageWith("specs"));
    const message = await rejection(publish(id));

    // The row that caused it, so the panel puts the error on that row.
    expect(message).toContain("blocks.0.items.0.anchor");
    // And the anchors that DO exist, so the fix is a copy rather than a hunt.
    expect(message).toContain("especificaciones");
    // The page stays a draft: nothing reached the storefront.
    expect(await storedStatus(id)).toBe("draft");
  });

  it("publishes the same page once the anchor matches the derived id", async () => {
    const id = await saveDraft(pageWith("especificaciones"));
    await publish(id);
    expect(await storedStatus(id)).toBe("published");
  });

  it("derives the anchor exactly as the renderer does, accents and all", async () => {
    // The one thing that must never drift: the CMS and the markup have to
    // agree on what «Tecnología · QuickDock» becomes.
    const id = await saveDraft({
      ...pageWith("tecnologia-quickdock", "Tecnología · QuickDock"),
    });
    await publish(id);
    expect(await storedStatus(id)).toBe("published");
  });

  it("says «no block has a name yet» rather than «not found» when none has", async () => {
    // The likeliest way to get here, and the one where "anchor not found"
    // would send an editor hunting for a typo in a list that does not exist.
    const id = await saveDraft(pageWith("especificaciones", null));
    const message = await rejection(publish(id));
    expect(message).toContain("ningún bloque de esta página tiene nombre");
    expect(message).not.toContain("Disponibles:");
    expect(await storedStatus(id)).toBe("draft");
  });

  it("lets the draft through — the index is written before the targets are named", async () => {
    // The decision recorded in pages.ts. Autosave fires every 375 ms while
    // an editor types; a refusal here is a refused save, and a refused save
    // is unsaved work.
    const id = await saveDraft(pageWith("todavia-no-existe"));
    expect(await draftAnchor(id)).toBe("todavia-no-existe");
    expect(await storedStatus(id)).toBe("draft");

    // And it stays let through on every later draft save, not just the first.
    await payload.update({
      collection: "pages",
      id,
      locale: "es",
      draft: true,
      overrideAccess: true,
      data: { ...pageWith("sigue-sin-existir"), _status: "draft" } as never,
    });
    expect(await draftAnchor(id)).toBe("sigue-sin-existir");
    expect(await storedStatus(id)).toBe("draft");
  });

  it("refuses a create that publishes straight away, without a draft in between", async () => {
    // A seed, a script or an import: no panel, no autosave, one call.
    const message = await rejection(
      payload.create({
        collection: "pages",
        locale: "es",
        overrideAccess: true,
        data: { ...pageWith("specs"), _status: "published" } as never,
      }),
    );
    expect(message).toContain("blocks.0.items.0.anchor");
  });

  it("names every bad row, not just the first", async () => {
    const id = await saveDraft(pageWith("specs"));
    const message = await rejection(publish(id));
    expect(message).toContain("blocks.0.items.0.anchor");
    expect(message).toContain("blocks.0.items.1.anchor");
  });

  it("writes the refusal in the language of the panel", async () => {
    const id = await saveDraft(pageWith("specs"));
    // `req.i18n.language` is the language of the PANEL, not `req.locale`,
    // which is the language of the content being edited — the rule
    // `hrefValidate` follows in blocks.ts.
    const english = await rejection(
      payload.update({
        collection: "pages",
        id,
        locale: "es",
        draft: false,
        overrideAccess: true,
        req: { i18n: { language: "en" } } as never,
        data: { _status: "published" },
      }),
    );
    expect(english).toContain("no block on this page produces that anchor");
  });
});
