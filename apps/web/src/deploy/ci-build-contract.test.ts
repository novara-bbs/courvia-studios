/**
 * Construir la app SIN construir sus dependencias no compila, y CI lo hizo
 * dos veces con `pnpm verify` en verde.
 *
 * ---------------------------------------------------------------------------
 * QUÉ PASÓ
 * ---------------------------------------------------------------------------
 *
 * El job `e2e` construía con `pnpm --filter @courvia/web build`. Eso ejecuta
 * el `build` de la app y de nadie más. Pero dos paquetes del monorepo GENERAN
 * ficheros que la app importa —`@courvia/design-tokens` escribe
 * `dist/tokens.css` y `@courvia/appearance` escribe `dist/appearance.css`, los
 * dos ignorados por Git—, así que en una copia limpia no existen y el build de
 * Next muere con `Module not found` en el layout de región.
 *
 * En local no se nota nunca: cualquiera que haya corrido `pnpm verify` antes
 * ya tiene esos `dist/` en disco. Se reprodujo borrándolos:
 *
 *     rm -rf packages/{design-tokens,appearance}/dist
 *     pnpm --filter @courvia/web build   → Module not found
 *
 * `pnpm verify` no lo veía porque pasa por `turbo run build`, y turbo respeta
 * `dependsOn: ["^build"]`. Dos commits salieron con verify verde y el job de
 * navegador rojo antes de que alguien mirase.
 *
 * ---------------------------------------------------------------------------
 * QUÉ VIGILA ESTE TEST
 * ---------------------------------------------------------------------------
 *
 * Que ningún paso del workflow construya un paquete por fuera de turbo. No
 * comprueba el resultado del build —eso lo hace el build— sino la FORMA de
 * invocarlo, que es donde estaba el error y donde volvería a estar: `--filter`
 * de pnpm y `--filter` de turbo se escriben casi igual y hacen cosas
 * distintas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

function ciWorkflow(): string {
  return readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
}

/** Las líneas `run:` del workflow, en una lista plana. */
function runCommands(yaml: string): string[] {
  return [...yaml.matchAll(/^\s*run:\s*(.+)$/gmu)].map((match) => (match[1] ?? "").trim());
}

describe("CI construye por turbo o no construye", () => {
  it("ningún paso invoca un `build` de pnpm saltándose el grafo de tareas", () => {
    /*
     * `pnpm --filter <paquete> build` y `pnpm turbo run build --filter=<paquete>`
     * se parecen y no son lo mismo: el primero ignora `dependsOn`. Cualquier
     * `pnpm ... build` que no lleve `turbo` delante es el fallo de vuelta.
     */
    const offenders = runCommands(ciWorkflow()).filter(
      (command) =>
        /\bpnpm\b/u.test(command) &&
        /\bbuild\b/u.test(command) &&
        !/\bturbo\b/u.test(command) &&
        // `pnpm build` a secas ES turbo: el script de la raíz es `turbo run build`.
        !/^pnpm run build$|^pnpm build$/u.test(command),
    );
    expect(
      offenders,
      "construyen un paquete sin construir sus dependencias; los `dist/` generados " +
        "por design-tokens y appearance no existirán y Next morirá con Module not found",
    ).toEqual([]);
  });

  it("el job de navegador construye antes de servir, y lo hace por turbo", () => {
    // Sin build no hay nada que `next start` pueda servir, y Playwright se
    // queda esperando 120 s a un puerto que nunca abre.
    const yaml = ciWorkflow();
    const e2eJob = /^ {2}e2e:\n((?: {4}.*\n|\n)*)/mu.exec(yaml)?.[1] ?? "";
    expect(e2eJob, "el job `e2e` desapareció del workflow").not.toBe("");
    expect(e2eJob).toContain("pnpm turbo run build --filter=@courvia/web");
  });

  it("y los dos paquetes que generan css siguen teniendo `build`, que es la premisa", () => {
    /*
     * Si algún día design-tokens deja de generar y pasa a commitear su css,
     * el test de arriba sobra. Mientras la premisa siga siendo cierta, esto
     * la deja escrita: son estos dos y no otros.
     */
    for (const pkg of ["design-tokens", "appearance"]) {
      const manifest = JSON.parse(
        readFileSync(join(repoRoot, "packages", pkg, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      expect(manifest.scripts?.build, `@courvia/${pkg} ya no genera nada`).toBeTruthy();
    }
  });
});
