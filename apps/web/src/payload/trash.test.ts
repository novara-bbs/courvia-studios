/**
 * The recycle bin, proved by its effect and not by its declaration.
 *
 * `trash: true` sitting in a config proves nothing: the question an editor
 * actually asks is "if I delete this page by mistake, is it gone, and can I
 * rebuild it at the same address?" So every assertion below is an act
 * followed by a look at Postgres:
 *
 *   1. a page is deleted the way the PANEL deletes it — a PATCH carrying
 *      `deletedAt` (@payloadcms/ui DeleteDocument/index.js line 93), not a
 *      call nobody in the product makes;
 *   2. the storefront's own query stops finding it, while `select` on the
 *      table shows the row is still there;
 *   3. a NEW page claims the same slug and is created;
 *   4. and a second LIVE page with that slug is still refused, because a bin
 *      that quietly turned uniqueness off would be the worse bug.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SUITE BUILDS ITS OWN SCHEMA
 * ---------------------------------------------------------------------------
 *
 * The migration for this phase is generated once, at the end, from every
 * schema change in it — this task declares and stops. So `payload.deleted_at`
 * does not exist yet, and a test written against the migrated schema would be
 * red until somebody else's work landed.
 *
 * Instead the suite pushes the DECLARED schema into a throwaway Postgres
 * schema and applies `liveUniqueIndexStatements()` — the same exported DDL
 * the migration will run. That makes the thing under test the declaration
 * itself: if the config or the index is wrong, this goes red now, and it goes
 * on being right after the migration lands, because both read the same
 * constant.
 *
 * It writes and drops tables, so like the redirect and slug suites it only
 * runs against a disposable database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BasePayload, SanitizedConfig } from "payload";

import { LIVE_UNIQUE_INDEXES, liveUniqueIndexStatements } from "./trash";

const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = databaseUrl !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(databaseUrl) || process.env.CI === "true";

/** Never `payload`: this schema is created and dropped by the suite. */
const SCHEMA = "payload_trash_test";

const SLUG = "papelera-de-prueba";
/** Deliberately NOT the page slug above: `validateFrom` refuses a redirect
 *  whose source is a published page, and the first test leaves one there. */
const FROM = "/papelera-redireccion";

let payload: BasePayload;

interface Pool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

function pool(): Pool {
  return (payload.db as unknown as { pool: Pool }).pool;
}

async function rows<Row>(sql: string, values: unknown[] = []): Promise<Row[]> {
  const result = await pool().query(sql, values);
  return result.rows as Row[];
}

/** A page as the SERVING side asks for it — the same `where` that
 *  `src/content/get-page.ts` uses, so "gone from the storefront" is measured
 *  with the storefront's own question rather than a friendlier one. */
async function servedPage(slug: string): Promise<{ id: number | string } | undefined> {
  const result = await payload.find({
    collection: "pages",
    where: { slug: { equals: slug }, _status: { equals: "published" } },
    limit: 1,
    depth: 0,
  });
  return result.docs[0] as { id: number | string } | undefined;
}

/** Rows in the table itself, trashed ones included — the only reading that
 *  can tell "deleted" from "never existed". */
async function storedPages(slug: string): Promise<{ id: number; deleted_at: string | null }[]> {
  return rows(`select id, deleted_at from "${SCHEMA}".pages where slug = $1 order by id`, [slug]);
}

async function createPage(slug: string, title: string): Promise<number> {
  const doc = await payload.create({
    collection: "pages",
    data: { title, slug, _status: "published" },
    overrideAccess: true,
  });
  return Number(doc.id);
}

/** Exactly what the panel's Delete button sends once `trash` is on. */
async function trashPage(id: number): Promise<void> {
  await payload.update({
    collection: "pages",
    id,
    data: { deletedAt: new Date().toISOString() },
    overrideAccess: true,
  });
}

describe.skipIf(!hasDb || !dbIsDisposable)("papelera de contenido", () => {
  beforeAll(async () => {
    const { getPayload } = await import("payload");
    const { postgresAdapter } = await import("@payloadcms/db-postgres");
    const { default: appConfig } = await import("@payload-config");

    const config: SanitizedConfig = {
      ...(await appConfig),
      // Same collections, same globals, same fields — only the destination
      // changes. `push: true` is what makes the DECLARED schema the thing
      // under test instead of whatever the last migration happened to build.
      db: postgresAdapter({
        schemaName: SCHEMA,
        push: true,
        pool: { connectionString: databaseUrl },
      }) as unknown as SanitizedConfig["db"],
    };
    // A separate `key`, or Payload would hand back the cached instance that
    // the other suites in this worker are using against the real schema.
    payload = await getPayload({ config, key: "trash-test" });

    // Two statements the migration will also run, from the same constant.
    for (const statement of liveUniqueIndexStatements(SCHEMA)) {
      await pool().query(statement);
    }

    // Every table this repo creates is born with RLS on and no policy
    // (.claude/rules/database.md). The event trigger only covers `public`
    // and `payload`, so a schema invented by a test has to say so itself —
    // and Payload connects as the owner, which bypasses RLS exactly as it
    // does in production.
    await pool().query(`
      DO $$
      DECLARE t record;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = '${SCHEMA}' LOOP
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', '${SCHEMA}', t.tablename);
        END LOOP;
      END $$;`);
  });

  afterAll(async () => {
    if (payload as BasePayload | undefined) {
      await pool().query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await payload.destroy?.();
    }
  });

  it("borra una página, la deja existir, y libera su dirección", async () => {
    const first = await createPage(SLUG, "Página que se borra");
    expect(await servedPage(SLUG)).toBeDefined();

    await trashPage(first);

    // Gone from the shop…
    expect(await servedPage(SLUG)).toBeUndefined();
    // …and gone from the plain listing too, which is what the routing
    // manifest and the sitemap read.
    const listed = await payload.find({ collection: "pages", limit: 200, depth: 0 });
    expect(listed.docs.map((doc) => doc.id)).not.toContain(first);

    // …but still a row, with the timestamp that says why it is hidden.
    const stored = await storedPages(SLUG);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.deleted_at).not.toBeNull();

    // …and reachable on purpose, which is what the Papelera view does.
    const inTheBin = await payload.find({
      collection: "pages",
      where: { slug: { equals: SLUG } },
      trash: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    expect(inTheBin.docs[0]?.id).toBe(first);

    // The point of the whole exercise: the address is free again.
    const second = await createPage(SLUG, "Página reconstruida");
    expect(second).not.toBe(first);
    expect((await servedPage(SLUG))?.id).toBe(second);

    const both = await storedPages(SLUG);
    expect(both).toHaveLength(2);
    expect(both.filter((row) => row.deleted_at === null)).toHaveLength(1);
  });

  it("sigue rechazando dos páginas vivas con la misma dirección", async () => {
    const slug = "papelera-unicidad";
    await createPage(slug, "Primera viva");
    await expect(createPage(slug, "Segunda viva")).rejects.toThrow();
    const live = (await storedPages(slug)).filter((row) => row.deleted_at === null);
    expect(live).toHaveLength(1);
  });

  it("hace lo mismo con una redirección, que también tenía columna única", async () => {
    const created = await payload.create({
      collection: "redirects",
      data: { from: FROM, to: "/robots", code: "301", source: "manual" },
      overrideAccess: true,
    });
    const id = Number(created.id);

    await payload.update({
      collection: "redirects",
      id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    const live = await payload.find({
      collection: "redirects",
      where: { from: { equals: FROM } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    expect(live.docs).toHaveLength(0);

    // The rule can be written again, which is the case that used to answer
    // "El valor debe ser único" about a row nobody could see.
    const rewritten = await payload.create({
      collection: "redirects",
      data: { from: FROM, to: "/comparar", code: "301", source: "manual" },
      overrideAccess: true,
    });
    expect(Number(rewritten.id)).not.toBe(id);

    const stored = await rows<{ deleted_at: string | null }>(
      `select deleted_at from "${SCHEMA}".redirects where "from" = $1`,
      [FROM],
    );
    expect(stored).toHaveLength(2);
    expect(stored.filter((row) => row.deleted_at === null)).toHaveLength(1);
  });

  it("apoya esa promesa en un índice parcial, no en la buena voluntad", async () => {
    const found = await rows<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = $1`,
      [SCHEMA],
    );
    for (const { table, column, index } of LIVE_UNIQUE_INDEXES) {
      const definition = found.find((row) => row.indexname === index)?.indexdef;
      expect(definition, `${index} no existe`).toBeDefined();
      expect(definition).toContain("CREATE UNIQUE INDEX");
      expect(definition).toContain(`.${table} `);
      expect(definition).toContain(column);
      expect(definition).toContain("WHERE (deleted_at IS NULL)");
    }
  });
});
