/**
 * Qué variables de entorno lee el código de `apps/web`, leído del disco.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ES UN MÓDULO Y NO VIVE DENTRO DE UN TEST
 * ---------------------------------------------------------------------------
 *
 * Lo escribió `src/server/env-contract.test.ts` para comparar el código con
 * `.env.example`. El 23 ago 2026 hizo falta la misma lista para una pregunta
 * distinta —qué declara `turbo.json`— y copiarla habría sido garantizar que las
 * dos copias se separaran: la avería que este repositorio persigue, cometida
 * entre dos guardianes.
 *
 * Así que el escáner sale aquí y los dos tests lo importan. Un test no puede
 * importar a otro test sin arrastrar sus `describe`.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Build output and dependencies are not our source. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "coverage",
  // Uploaded media in local development.
  "media",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js"]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

/**
 * Three shapes, because any two of them would let a real read through. Written
 * with <NAME> so this comment does not match its own scanner:
 *
 *   process.env.<NAME>      the common one
 *   process.env["<NAME>"]   the same read, written differently
 *   env("<NAME>")           the accessor idiom for reads that need trimming
 *                           (src/payload/storage.ts, src/server/build-env.ts)
 *
 * A subscript with a variable — process.env[name] — is invisible to any
 * source scan. Naming that accessor `env` is what keeps those reads visible,
 * and it is the convention both files that need one follow.
 */
const READ_PATTERNS = [
  /process\.env\.([A-Za-z_$][A-Za-z0-9_$]*)/g,
  /process\.env\[\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g,
  /\benv\(\s*(["'])([A-Z][A-Z0-9_]*)\1\s*\)/g,
];

/** Every variable name the sources read, with the files that read it. */
export function readsInSource(): Map<string, Set<string>> {
  const reads = new Map<string, Set<string>>();
  for (const file of sourceFiles(APP_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of READ_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const name = match[2] ?? match[1];
        if (name === undefined) continue;
        const where = reads.get(name) ?? new Set<string>();
        where.add(path.relative(APP_DIR, file));
        reads.set(name, where);
      }
    }
  }
  return reads;
}
