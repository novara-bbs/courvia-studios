#!/usr/bin/env node
/**
 * `pnpm migrate:new <name>` — creates a Payload migration AND applies the
 * fixes its generator forgets, in one step:
 *   - `import { sql }` + `import type { MigrateDownArgs, MigrateUpArgs }`
 *     (the generator emits a runtime import of types → ESM SyntaxError)
 *   - `{ db }`-only signatures (unused args fail lint)
 * This ritual was performed by hand four times before becoming a script.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name) {
  console.error("Usage: pnpm migrate:new <snake_case_name>");
  process.exit(1);
}

const webDir = join(process.cwd(), "apps/web");
execSync(`pnpm --filter @courvia/web payload migrate:create ${name}`, { stdio: "inherit" });

const dir = join(webDir, "src/migrations");
const latest = readdirSync(dir)
  .filter((f) => f.endsWith(`_${name}.ts`))
  .sort()
  .at(-1);
if (!latest) {
  console.error(`No migration file matching *_${name}.ts found.`);
  process.exit(1);
}

const path = join(dir, latest);
let src = readFileSync(path, "utf8");

/** Replace-or-die: if the generator's template drifts (a Payload upgrade,
 *  a quote-style change), a silent no-op would ship a broken file that only
 *  explodes at migrate time. Failing here names the fix. */
function mustReplace(source, pattern, replacement) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    console.error(
      `✘ El generador de Payload cambió su plantilla: no encuentro ${String(pattern)}.\n` +
        "  Actualiza scripts/migrate-new.mjs y revisa a mano el archivo generado.",
    );
    process.exit(1);
  }
  return next;
}

src = mustReplace(
  src,
  /import \{ MigrateUpArgs, MigrateDownArgs, sql \} from (['"])@payloadcms\/db-postgres\1/,
  "import { sql } from '@payloadcms/db-postgres'\nimport type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'",
);
src = mustReplace(
  src,
  /export async function up\(\{ db, payload, req \}: MigrateUpArgs\)/,
  "export async function up({ db }: MigrateUpArgs)",
);
src = mustReplace(
  src,
  /export async function down\(\{ db, payload, req \}: MigrateDownArgs\)/,
  "export async function down({ db }: MigrateDownArgs)",
);
writeFileSync(path, src);
console.log(`✔ ${latest} creado y saneado (imports de tipos + firmas { db }).`);
console.log("  Siguiente: pnpm --filter @courvia/web migrate && pnpm --filter @courvia/web generate:types");
console.log("  Y commitea también src/migrations/index.ts (el generador lo regenera).");
