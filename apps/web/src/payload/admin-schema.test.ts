/**
 * The two schema facts that this phase's declarations rest on, measured
 * rather than assumed.
 *
 * ---------------------------------------------------------------------------
 * 1. Nothing the adapter builds exceeds 63 characters.
 * ---------------------------------------------------------------------------
 *
 * Postgres truncates identifiers at 63 (NAMEDATALEN - 1). Payload guards its
 * TABLE and ENUM names — `validateIdentifierLength` throws at boot — but it
 * does not guard INDEX or FOREIGN KEY names, and Postgres does not refuse
 * those: it silently cuts them and issues a notice nobody reads. Two indexes
 * whose names differ only past character 63 then become one.
 *
 * That is not hypothetical here. Giving `market-settings` a versions table
 * put `_markets_v_version_markets_payment_providers_methods_parent_idx` at
 * exactly 63 — legal, with no margin — and the `templates` enum sits at 63
 * too. One more nested field under either and something breaks quietly. This
 * test is the tripwire, so the next person to add one gets a red test with
 * the offending name in it instead of a database that looks fine.
 *
 * ---------------------------------------------------------------------------
 * 2. The three globals have version tables, and `market-settings` has the
 *    short `dbName` that makes its own possible.
 * ---------------------------------------------------------------------------
 *
 * Without `dbName: "markets"` the enum under `paymentProviders.methods`
 * reaches 65 characters inside the version table and Payload refuses to boot
 * at all. So the rename is not a preference: asserting it here is asserting
 * that versions on this global are reachable.
 *
 * Needs a database only because `getPayload` connects before the adapter
 * exposes the schema it built; nothing here writes a row.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

/** Postgres NAMEDATALEN - 1, the same constant @payloadcms/drizzle uses. */
const MAX_IDENTIFIER = 63;

interface RawTable {
  indexes?: Record<string, { name: string }>;
  foreignKeys?: Record<string, { name: string }>;
  columns?: Record<string, { type: string; enumName?: string }>;
}

let payload: BasePayload;
let rawTables: Record<string, RawTable>;

describe.skipIf(!hasDb)("el esquema que declaran las colecciones", () => {
  beforeAll(async () => {
    const { getPayload } = await import("payload");
    const { default: config } = await import("@payload-config");
    payload = await getPayload({ config });
    rawTables = (payload.db as unknown as { rawTables: Record<string, RawTable> }).rawTables;
  });

  it("no genera ningún identificador de más de 63 caracteres", () => {
    const tooLong: string[] = [];
    for (const [table, definition] of Object.entries(rawTables)) {
      const names = [
        table,
        ...Object.values(definition.indexes ?? {}).map((index) => index.name),
        ...Object.values(definition.foreignKeys ?? {}).map((key) => key.name),
        ...Object.values(definition.columns ?? {}).flatMap((column) =>
          column.type === "enum" && column.enumName !== undefined ? [column.enumName] : [],
        ),
      ];
      tooLong.push(...names.filter((name) => name.length > MAX_IDENTIFIER));
    }
    expect([...new Set(tooLong)]).toEqual([]);
  });

  it("da tabla de versiones a los tres globals", () => {
    for (const table of ["_theme_settings_v", "_navigation_v", "_markets_v"]) {
      expect(Object.keys(rawTables), `falta ${table}`).toContain(table);
    }
  });

  it("acorta market-settings con dbName, que es lo que hace posible su versión", () => {
    expect(Object.keys(rawTables)).toContain("markets");
    // The old names must be gone, or the rename never happened and the enum
    // that used to throw at boot is one field away from coming back.
    const oldNames = Object.keys(rawTables).filter((table) => table.startsWith("market_settings"));
    expect(oldNames).toEqual([]);
  });

  /**
   * Which collections have a recycle bin, stated as a whole rather than one
   * flag at a time.
   *
   * The commerce half of the list is the part that matters: an order is
   * cancelled, never deleted, and a bin would be a second and softer way to
   * make a financial row stop existing. If somebody adds `trash: true` to
   * `orders` this fails, which is the point.
   */
  it("da papelera al contenido y a nada más", () => {
    const withTrash = payload.config.collections
      .filter((collection) => collection.trash === true)
      .map((collection) => collection.slug)
      .sort();
    expect(withTrash).toEqual(["media", "pages", "redirects"]);
  });
});
