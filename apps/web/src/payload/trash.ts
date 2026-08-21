/**
 * The safety net under Delete, and the one thing Payload cannot declare for
 * itself.
 *
 * `trash: true` on a collection (Payload 3.88) adds a `deletedAt` timestamp
 * and rewires every read: `find`, `findByID` and `count` append
 * `deletedAt exists: false` unless the caller explicitly asks for
 * `trash: true` (payload/dist/utilities/appendNonTrashedFilter.js). So the
 * storefront needs no change at all — `get-page.ts`, the routing manifest,
 * the sitemap and the redirect manifest all read through those operations,
 * and a trashed document disappears from every one of them while its row
 * stays in Postgres.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS: a unique column and a recycle bin cannot coexist.
 * ---------------------------------------------------------------------------
 *
 * `pages.slug` and `redirects.from` are UNIQUE. Postgres does not know that a
 * row with `deleted_at` set is in the bin — it is a row, it holds the value,
 * and the value stays taken. Concretely, without this file:
 *
 *   1. An editor trashes /tecnologia by mistake.
 *   2. They rebuild the page and type the same address.
 *   3. Payload answers "El valor debe ser único" about a page they cannot
 *      see, in a list that does not show it.
 *
 * A bin you cannot undo AND cannot work around is worse than no bin. The fix
 * is a PARTIAL unique index — unique among the rows that are not in the bin:
 *
 *     CREATE UNIQUE INDEX … ON payload.pages (slug) WHERE deleted_at IS NULL
 *
 * Payload has no way to declare that. `unique: true` on the field builds a
 * total unique index, and `CollectionConfig.indexes` (compound indexes) has
 * `fields` and `unique` and no `where`
 * (payload/dist/collections/config/types.d.ts, `CompoundIndex`). Adding it
 * through the drizzle schema (`postgresAdapter.afterSchemaInit`) would need
 * both a line in `payload.config.ts` and `drizzle-orm` as a direct
 * dependency of this app, which it is not.
 *
 * So the index is DDL, declared here once and applied twice: by the phase
 * migration, and by the test that proves the behaviour
 * (`trash.test.ts`) against a schema it builds itself. One source of truth,
 * so the guarantee the test demonstrates is literally the guarantee the
 * migration installs.
 *
 * The consequence for the field configs: `unique: true` is REMOVED from
 * `pages.slug` and `redirects.from`, because a total unique index would
 * defeat the partial one before it ever fired. The uniqueness is not weaker
 * — it is still a unique btree in Postgres, still raising 23505, and
 * `handleUpsertError` still turns that into "El valor debe ser único" on the
 * right field (it falls back to parsing `Key (slug)=(…)` out of the error
 * detail when the constraint is not one it named itself). What changed is
 * only WHICH rows it covers.
 *
 * `index: true` stays on both fields, so the generated migration already
 * rebuilds `pages_slug_idx` and `redirects_from_idx` as PLAIN indexes on its
 * own — the schema diff sees the `unique` flag drop. The only hand-written
 * half is the CREATE below, and it is invisible to the drizzle snapshot,
 * which is what keeps a later `migrate:create` from trying to drop it: an
 * index in neither snapshot is an index the diff never mentions.
 *
 * ---------------------------------------------------------------------------
 * What trash does NOT get applied to.
 * ---------------------------------------------------------------------------
 *
 * Commerce. An order is not deleted, it is cancelled; a payment is a ledger
 * entry; a shipment is the evidence behind `shipped` and `orders-fulfilment.ts`
 * already refuses to delete one. Giving those a recycle bin would offer a
 * second, softer way to make a financial row stop existing, which is exactly
 * what the state machine exists to prevent.
 *
 * Media keeps its total unique index on `filename` on purpose: the FILE is
 * still in the bucket while the document is in the bin, so the name is still
 * taken. A partial index there would let a second upload overwrite the very
 * file the bin is holding.
 */

/** One "unique among the rows that are not in the bin" index. */
export interface LiveUniqueIndex {
  /** Payload collection slug — what the panel calls it. */
  readonly collection: string;
  /** Postgres table inside the `payload` schema. */
  readonly table: string;
  /** Column, already snake_cased the way the adapter writes it. */
  readonly column: string;
  /** Index name. Not `*_idx`: that suffix is Payload's, and colliding with
   *  one it generates would make a future migration fight this one. */
  readonly index: string;
}

/**
 * Every column that must stay unique among live rows once trash is on.
 *
 * Both entries replace a `unique: true` that used to sit on the field. If a
 * third arrives, it belongs here and in the same migration — never as a
 * `unique: true` that quietly re-locks a slug an editor cannot see.
 */
export const LIVE_UNIQUE_INDEXES: readonly LiveUniqueIndex[] = [
  { collection: "pages", table: "pages", column: "slug", index: "pages_slug_live_unique" },
  { collection: "redirects", table: "redirects", column: "from", index: "redirects_from_live_unique" },
];

/**
 * The DDL, for a given schema.
 *
 * `IF NOT EXISTS` so the phase migration is safe to re-run and so the test
 * can apply it to a schema it just pushed. Every identifier is quoted:
 * `from` is a reserved word, and an unquoted `from` in a column list is a
 * syntax error rather than a subtle bug.
 */
export function liveUniqueIndexStatements(schema: string): string[] {
  return LIVE_UNIQUE_INDEXES.map(
    ({ table, column, index }) =>
      `CREATE UNIQUE INDEX IF NOT EXISTS "${index}" ON "${schema}"."${table}" ("${column}") WHERE "deleted_at" IS NULL`,
  );
}
