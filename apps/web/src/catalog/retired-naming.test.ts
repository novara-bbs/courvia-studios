/**
 * El naming que ADR-022 retiró no vuelve.
 *
 * ADR-022 dice, literal: «El naming heredado (Drill One/Pro/Club) se retira
 * de docs y ejemplos; "Drill" sobrevive únicamente como entidad societaria y
 * como nombre de la biblioteca de rutinas (Courvia Drills)».
 *
 * Se escribió el 20 ago 2026 y **no se aplicó al código**. Doce sitios
 * seguían usándolo un día después, y dos de ellos los lee un editor en el
 * panel: la descripción del campo de marca de `Products` decía «La familia
 * (Drill Pro, Drill One…)» sobre un catálogo que se llama Tempo, Go y Rally.
 * Una gama inventada, presentada como ayuda contextual, a la persona que
 * escribe la ficha.
 *
 * Por eso el guardarraíl es un test y no una nota: una decisión que solo
 * vive en un ADR es una decisión que alguien vuelve a tomar al revés.
 *
 * El catálogo real lo siembra `apps/web/src/seeds/seed-catalog.ts`: las
 * líneas `tempo`, `go` y `rally`, y los productos `tempo-r1`,
 * `go-pickleball` y `rally-station`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

/** Lo retirado, en las formas en que aparecía: prosa y slug. */
const RETIRED = /Drill (?:One|Pro|Club)|drill-(?:one|pro|club)/;

/**
 * Nombrarlo es correcto en un sitio: cuando se nombra **para decir que está
 * retirado**. Eso es una propiedad de la línea, no del fichero, y por eso la
 * regla no es una lista de ficheros permitidos: una lista así deja entrar
 * una violación nueva en cualquiera de ellos y nadie se entera.
 *
 * La ventana es de dos líneas a cada lado porque los comentarios y las
 * tablas de markdown parten la frase: en `llms.txt/route.ts` el nombre está
 * en una línea y «withdrawn» en la siguiente.
 */
// `retir` cubre las cuatro formas que aparecen de verdad — «se retira»,
// «retirado», «retiró», «la retirada»— y la primera versión de esto solo
// cubría tres, así que el ADR que ordena la retirada se marcaba a sí mismo.
const RETIREMENT_MARKER = /retir|withdrawn|ADR-022|404/i;
const CONTEXT_LINES = 2;

/** Este fichero, que necesita escribir el patrón para poder buscarlo. */
const ALLOWED = new Set(["apps/web/src/catalog/retired-naming.test.ts"]);

const ROOTS = ["packages", "apps/web/src", "apps/web/app", "docs", "CLAUDE.md"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage", ".turbo"]);
const EXTENSIONS = [".ts", ".tsx", ".md", ".css", ".json"];

function walk(absolute: string, relative: string, out: string[]): void {
  const stats = statSync(absolute);
  if (stats.isFile()) {
    if (EXTENSIONS.some((extension) => absolute.endsWith(extension))) out.push(relative);
    return;
  }
  for (const entry of readdirSync(absolute)) {
    if (SKIP_DIRS.has(entry)) continue;
    walk(join(absolute, entry), `${relative}/${entry}`, out);
  }
}

function sourceFiles(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) walk(join(repoRoot, root), root, found);
  // Generado por Payload desde las descripciones: si una descripción vuelve
  // a nombrar la gama retirada, el fallo tiene que apuntar a la fuente.
  return found.filter((path) => !path.endsWith("payload-types.ts"));
}

describe("el naming que ADR-022 retiró", () => {
  it("encuentra ficheros que mirar", () => {
    // Sin esto, un fallo del recorrido convierte la comprobación de abajo en
    // una afirmación sobre la lista vacía, que pasa para siempre.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("apps/web/src/payload/catalog.ts");
    expect(files).toContain("packages/sections/src/blocks/hero/index.tsx");
  });

  it("no aparece fuera de los sitios que lo nombran para retirarlo", () => {
    const offenders = sourceFiles()
      .filter((path) => !ALLOWED.has(path.replace(/^\.\//, "")))
      .flatMap((path) => {
        const lines = readFileSync(join(repoRoot, path), "utf8").split("\n");
        return lines
          .map((line, index) => ({ line, index }))
          .filter((entry) => RETIRED.test(entry.line))
          .filter(
            (entry) =>
              !lines
                .slice(Math.max(0, entry.index - CONTEXT_LINES), entry.index + CONTEXT_LINES + 1)
                .some((nearby) => RETIREMENT_MARKER.test(nearby)),
          )
          .map(
            (entry) =>
              `${path}:${String(entry.index + 1)} — ${entry.line.trim().slice(0, 90)}`,
          );
      });
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("y el catálogo que sí existe está donde el test cree", () => {
    // La otra mitad: prohibir un nombre sin comprobar que el sustituto es
    // real deja el repositorio libre de un error y lleno de otro.
    const seed = readFileSync(join(repoRoot, "apps/web/src/seeds/seed-catalog.ts"), "utf8");
    for (const slug of ["tempo-r1", "go-pickleball", "rally-station"]) {
      expect(seed, `${slug} ya no lo siembra nadie`).toContain(`slug: "${slug}"`);
    }
  });
});
