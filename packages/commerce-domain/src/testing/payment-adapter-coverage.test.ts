/**
 * El guardián: descubre el adaptador que NO corre la suite de contrato.
 *
 * CLAUDE.md §3.2 afirma que «todo adaptador debe pasar las suites de
 * contrato». Hasta hoy esa frase era una costumbre: los cuatro paquetes
 * `payments-*` tenían tests propios, muy buenos, y ninguno llamaba a
 * `describePaymentProviderContract`. Nada lo decía, porque nadie lo miraba.
 *
 * Este test mira. Enumera `packages/payments-*` DEL DISCO —la lista se
 * descubre, no se escribe aquí— y exige de cada paquete dos cosas: que
 * ejecute la suite común y que tenga un script `test` que la ejecute. Un
 * adaptador nuevo pone CI en rojo el día que se crea, no el día que alguien
 * se acuerde.
 *
 * Vive en commerce-domain porque el contrato es suyo, y no importa ningún
 * `payments-*`: lee ficheros. Importarlos rompería `domain-stays-pure` en
 * `pnpm arch` y, peor, dejaría que el dominio dependiera de sus adaptadores.
 *
 * Y corre cuando tiene que correr: la tarea `@courvia/commerce-domain#test`
 * de turbo.json añade a sus inputs un glob sobre `packages/payments-`, así
 * que crear un adaptador cambia el hash de este test y la caché no puede
 * servir un verde viejo. Sin esa línea el guardián seguiría siendo cierto y
 * llegaría tarde.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CONTRACT = "describePaymentProviderContract";
const TESTING_ENTRY = "@courvia/commerce-domain/testing";

/** La raíz se busca subiendo hasta el workspace: el runner arranca con el
 *  cwd del paquete, y suponer la profundidad es cómo estos tests se rompen
 *  al mover un fichero. */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("no encuentro la raíz del monorepo (pnpm-workspace.yaml)");
    }
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

/** Todo directorio `packages/payments-*`. Esto es el guardián: cualquier
 *  adaptador nuevo entra solo. */
function adapterPackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("payments-"))
    .map((entry) => entry.name)
    .sort();
}

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return /\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Sin comentarios: una llamada comentada no ejecuta nada, y una promesa en
 *  un comentario tampoco. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Corre la suite = la importa del punto de entrada de commerce-domain Y la
 * llama, en el mismo fichero. Exigir el import cierra el atajo obvio:
 * declarar una función local con el mismo nombre y llamarla.
 */
function runsTheContract(file: string): boolean {
  const source = withoutComments(readFileSync(file, "utf8"));
  const imported = new RegExp(
    `import\\s*\\{[^}]*\\b${CONTRACT}\\b[^}]*\\}\\s*from\\s*["']${TESTING_ENTRY}["']`,
  ).test(source);
  const called = new RegExp(`\\b${CONTRACT}\\s*\\(`).test(source);
  return imported && called;
}

const ADAPTERS = adapterPackages();

describe("todo packages/payments-* corre la suite de contrato del puerto", () => {
  it("encuentra al menos un adaptador que vigilar", () => {
    // Un guardián que enumera cero paquetes pasa siempre: eso es exactamente
    // lo que convierte un test en decorado.
    expect(
      ADAPTERS.length,
      `no hay ningún packages/payments-* bajo ${PACKAGES_DIR}: el escaneo está roto`,
    ).toBeGreaterThan(0);
  });

  for (const name of ADAPTERS) {
    const dir = path.join(PACKAGES_DIR, name);

    describe(name, () => {
      it("declara un script `test`", () => {
        // Sin script no hay ejecución: `turbo run test` pasaría de largo y la
        // suite estaría escrita sin correrse nunca.
        const manifest = path.join(dir, "package.json");
        expect(existsSync(manifest), `falta ${path.relative(REPO_ROOT, manifest)}`).toBe(true);
        const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
          scripts?: Record<string, string>;
        };
        expect(
          pkg.scripts?.test,
          `${name} no tiene script \`test\`: su suite de contrato no se ejecutaría`,
        ).toBeTruthy();
      });

      it(`ejecuta ${CONTRACT}`, () => {
        const runners = testFiles(path.join(dir, "src"))
          .filter(runsTheContract)
          .map((file) => path.relative(REPO_ROOT, file));

        expect(
          runners.length,
          [
            `${name} no ejecuta la suite de contrato del puerto de pagos.`,
            `Añade en un fichero \`packages/${name}/src/*.test.ts\`:`,
            "",
            `  import { ${CONTRACT} } from "${TESTING_ENTRY}";`,
            `  ${CONTRACT}("MiProveedor", () => new MiProveedor({ … }), { … });`,
            "",
            "Los fixtures y qué declara cada uno están en",
            "packages/commerce-domain/src/testing/contracts.ts; las fugas por",
            "esquema de firma, en docs/payments-runbook.md. Si algún método no",
            "se puede implementar todavía, decláralo como no conectado y que",
            "lance NotImplementedError: el puerto permite lanzar, nunca fingir.",
          ].join("\n"),
        ).toBeGreaterThan(0);
      });
    });
  }
});
