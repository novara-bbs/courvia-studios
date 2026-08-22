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
 * 2. Quién tiene versiones, quién no, y la forma que Payload no sabe
 *    versionar.
 * ---------------------------------------------------------------------------
 *
 * `navigation` y `theme-settings` las tienen. `market-settings` NO, y no por
 * gusto: Payload 3.88 no sabe escribir su tabla de versiones cuando hay un
 * select `hasMany` dentro de un array (el porqué exacto está en
 * `market-settings.ts`). Costó un CI en rojo, así que aquí hay dos
 * comprobaciones: que la tabla no ha vuelto, y que ningún otro versionado
 * tiene esa forma.
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

  it("da tabla de versiones a los dos globals que un editor toca", () => {
    for (const table of ["_theme_settings_v", "_navigation_v"]) {
      expect(Object.keys(rawTables), `falta ${table}`).toContain(table);
    }
    // Y NO a market-settings. La razón está en `market-settings.ts` y no es
    // una preferencia: Payload 3.88 no sabe escribir su tabla de versiones.
    // El test de abajo comprueba la forma que lo provoca; este comprueba que
    // la tabla no ha vuelto.
    expect(Object.keys(rawTables)).not.toContain("_markets_v");
  });

  /**
   * La forma que Payload 3.88 no sabe versionar, y que costó un CI en rojo.
   *
   * Un `select` con `hasMany` guarda sus valores en una tabla aparte cuyo
   * `parent` apunta a la fila que lo contiene. Al escribir, `upsertRow` solo
   * rellena ese `parent` si viene sin definir, y `transformForWrite` ya se lo
   * ha puesto: el id que trae el documento. En las tablas vivas ese id es el
   * bueno; en una tabla de VERSIONES los ids de array son `serial`, la fila
   * nace con otro, y el insert acaba metiendo un varchar de 24 hex en una
   * columna integer.
   *
   * El fallo no aparece hasta que alguien guarda con el select NO vacío, así
   * que no lo ve un test de arranque ni un `pnpm build`: lo vio CI al
   * sembrar. Esto lo adelanta a `pnpm verify`, y lo hace para TODAS las
   * colecciones y globals con versiones en vez de para el que falló.
   */
  it("ningún versionado anida un select hasMany dentro de un array", () => {
    interface AnyField {
      type: string;
      name?: string;
      hasMany?: boolean;
      fields?: AnyField[];
      tabs?: { fields?: AnyField[] }[];
      blocks?: { fields?: AnyField[] }[];
    }

    /** Los selects `hasMany` que cuelgan de un array, con su camino. */
    function offenders(fields: AnyField[], path: string, insideArray: boolean): string[] {
      const found: string[] = [];
      for (const field of fields) {
        const here = field.name === undefined ? path : `${path}.${field.name}`;
        if (field.type === "select" && field.hasMany === true && insideArray) {
          found.push(here);
        }
        const nested = [
          ...(field.fields ?? []),
          ...(field.tabs ?? []).flatMap((tab) => tab.fields ?? []),
          ...(field.blocks ?? []).flatMap((block) => block.fields ?? []),
        ];
        if (nested.length > 0) {
          found.push(...offenders(nested, here, insideArray || field.type === "array"));
        }
      }
      return found;
    }

    const versioned: { label: string; fields: AnyField[] }[] = [
      // Payload normaliza `versions` a un objeto o a `undefined` tras
      // sanear la config: `!== false` compilaba y no comparaba nada.
      ...payload.config.collections
        .filter((collection) => collection.versions !== undefined)
        .map((collection) => ({
          label: `collection ${collection.slug}`,
          fields: collection.fields as unknown as AnyField[],
        })),
      ...payload.config.globals
        .filter((global) => global.versions !== undefined)
        .map((global) => ({
          label: `global ${global.slug}`,
          fields: global.fields as unknown as AnyField[],
        })),
    ];
    // Sin esto, un cambio en cómo Payload normaliza `versions` convertiría
    // la comprobación en una afirmación sobre la lista vacía.
    expect(versioned.length).toBeGreaterThan(2);

    const broken = versioned.flatMap(({ label, fields }) =>
      offenders(fields, label, false).map((path) => path),
    );
    expect(broken, broken.join("\n")).toEqual([]);
  });

  it("acorta market-settings con dbName", () => {
    expect(Object.keys(rawTables)).toContain("markets");
    // Los nombres viejos tienen que haber desaparecido: si no, el renombrado
    // de la Fase 3 no ocurrió y la migración que lo hace está mintiendo.
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
