/**
 * El check que `docs/ARCHITECTURE.md` prometía y no existía.
 *
 * ---------------------------------------------------------------------------
 * PARA QUÉ
 * ---------------------------------------------------------------------------
 *
 * Retirar una sección son tres pasos: marcarla `deprecated` (desaparece del
 * selector, sigue renderizando) → una migración que reescribe las instancias →
 * borrar el código en una release posterior. El paso peligroso es el tercero,
 * y lo único que lo hace seguro es saber si queda contenido usándola. La
 * arquitectura decía que un check lo comprobaba; no lo comprobaba nadie.
 *
 * Sin él, borrar el código de una sección que todavía tiene instancias no
 * rompe la página —el renderer omite lo que no conoce y avisa en preview— pero
 * hace desaparecer contenido publicado en silencio, que es peor.
 *
 * ---------------------------------------------------------------------------
 * CÓMO, DADO QUE PAYLOAD NO GUARDA UN JSON
 * ---------------------------------------------------------------------------
 *
 * Con el adaptador de Postgres cada bloque tiene **su propia tabla**:
 * `pages_blocks_media_text`, `_pages_v_blocks_hero_ctas`… Así que no hay una
 * columna `blockType` que consultar; lo que hay es un esquema donde el nombre
 * de la tabla ES el tipo. El check lee `pg_tables`, se queda con lo que va
 * después de `_blocks_`, y busca si alguna sección registrada encaja como
 * prefijo — en frontera de `_`, para que `hero` reconozca a
 * `pages_blocks_hero_ctas` (su array interno) sin que `stat_band` reconozca a
 * `stat_bandera`.
 *
 * Solo cuenta como huérfana una tabla **con filas**. Una tabla vacía que quedó
 * de una sección retirada es ruido de esquema, no contenido perdido: se limpia
 * con una migración cuando toque, y no debe poner CI en rojo.
 *
 *   pnpm --filter @courvia/web check:blocks
 *
 * Sale con 1 si encuentra contenido que ningún código sabe pintar, nombrando
 * la tabla y cuántas filas. Comprobado fabricando las dos formas de huérfana:
 *
 *     pages_blocks_carousel_retirado  (2 filas)  → exit 1, nombrada
 *     pages_blocks_vacio_retirado     (0 filas)  → ignorada
 *
 * Un check que solo dijera «todo bien» sobre un esquema sano no distingue
 * entre funcionar y no mirar.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTO NO ES
 * ---------------------------------------------------------------------------
 *
 * **No es un check nocturno contra producción.** Corre contra la base de datos
 * que le diga `DATABASE_URL`, y en CI esa es la desechable con las semillas
 * —que sí es contenido real: es el que se publica—. Apuntarlo a producción es
 * una variable de entorno y ninguna línea de código, pero exige una URL de
 * solo lectura que este repo no tiene y que no se pide desde aquí
 * (`.claude/rules/database.md`). `docs/ARCHITECTURE.md` dice ahora lo que hay,
 * no lo que se prometió.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { SECTIONS } = await import("@courvia/sections/registry");

/** `mediaText` → `media_text`, que es como Payload nombra la tabla. */
function snake(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

const registered = Object.keys(SECTIONS).map(snake).sort();

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });
const db = payload.db as unknown as {
  pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  schemaName?: string;
};
const schema = db.schemaName ?? "public";

const { rows } = await db.pool.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename LIKE '%\\_blocks\\_%'
    ORDER BY tablename`,
  [schema],
);

/** El nombre del bloque que la tabla dice llevar, sin sufijos de Payload. */
function blockNameOf(tablename: string): string {
  const after = tablename.slice(tablename.indexOf("_blocks_") + "_blocks_".length);
  return after.replace(/_locales$/u, "");
}

function isRegistered(name: string): boolean {
  return registered.some((block) => name === block || name.startsWith(`${block}_`));
}

const suspects = rows
  .map((row) => String(row.tablename))
  .filter((tablename) => !isRegistered(blockNameOf(tablename)));

const orphans: { table: string; count: number }[] = [];
for (const table of suspects) {
  const counted = await db.pool.query(`SELECT count(*)::int AS n FROM "${schema}"."${table}"`);
  const count = Number(counted.rows[0]?.n ?? 0);
  if (count > 0) orphans.push({ table, count });
}

console.log(
  `check:blocks — ${String(registered.length)} secciones registradas, ` +
    `${String(rows.length)} tablas de bloque en el esquema "${schema}".`,
);

if (suspects.length > 0 && orphans.length === 0) {
  console.log(
    `Tablas sin sección que las respalde pero VACÍAS (ruido de esquema, no contenido): ` +
      suspects.join(", "),
  );
}

if (orphans.length > 0) {
  console.error("\nContenido que ningún código sabe pintar:\n");
  for (const orphan of orphans) {
    console.error(`  ${orphan.table} — ${String(orphan.count)} fila(s)`);
  }
  console.error(
    "\nAntes de borrar el código de una sección hay que reescribir sus instancias\n" +
      "con una migración (docs/ARCHITECTURE.md, «Resiliencia»). Estas siguen ahí.",
  );
  process.exit(1);
}

console.log("Ninguna instancia huérfana.");
process.exit(0);
