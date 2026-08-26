/**
 * Lo que CI configura tiene que llegar a la tarea. No es obvio, y ya costó
 * una ejecución en rojo.
 *
 * Turborepo corre en modo estricto: la tarea hija solo ve las variables que
 * `turbo.json` declara en `env`, `globalEnv` o `globalPassThroughEnv`; todo
 * lo demás lo elimina antes de lanzar el comando. Así que ponerlo en el
 * bloque `env:` del workflow **no basta**, y el síntoma es cruel: la
 * variable aparece impresa en el log del paso, y el proceso que la necesita
 * no la ve.
 *
 * Pasó exactamente así con `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: el
 * paso de arch las imprimía en su volcado de entorno mientras el test de
 * exposición del Data API moría diciendo que no estaban puestas. Media hora
 * mirando el sitio equivocado.
 *
 * Este test compara las dos listas y falla nombrando la que falta. Los
 * valores no se leen: solo los nombres.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTurboJson } from "./turbo-json";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * Variables que la propia plataforma inyecta y que Turborepo ya reenvía por
 * su cuenta o que ninguna tarea necesita. Lista explícita y corta: un patrón
 * amplio aquí vaciaría el test de contenido.
 */
const PLATFORM_PROVIDED = new Set([
  "NEXT_TELEMETRY_DISABLED", // la lee el CLI de Next en el proceso raíz
]);

function ciWorkflowEnvNames(): string[] {
  const yaml = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  // El bloque `env:` de nivel superior: desde la línea `env:` sin sangrar
  // hasta la siguiente línea sin sangrar (`jobs:`).
  const block = /^env:\n((?:[ \t]+.*\n|\n)*)/m.exec(yaml);
  if (block === null) throw new Error("ci.yml ya no tiene un bloque env: de nivel superior");
  return [...block[1]!.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]!);
}

function turboForwardedNames(): string[] {
  const turbo: unknown = readTurboJson(join(repoRoot, "turbo.json"));
  const config = turbo as {
    globalEnv?: string[];
    globalPassThroughEnv?: string[];
    tasks?: Record<string, { env?: string[]; passThroughEnv?: string[] }>;
  };
  return [
    ...(config.globalEnv ?? []),
    ...(config.globalPassThroughEnv ?? []),
    ...Object.values(config.tasks ?? {}).flatMap((task) => [
      ...(task.env ?? []),
      ...(task.passThroughEnv ?? []),
    ]),
  ];
}

/** `NEXT_PUBLIC_*` cubre `NEXT_PUBLIC_SITE_URL`; el resto son nombres exactos. */
function forwards(patterns: string[], name: string): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name,
  );
}

describe("lo que CI configura llega a la tarea", () => {
  it("toda variable del workflow la reenvía turbo.json", () => {
    const forwarded = turboForwardedNames();
    const dropped = ciWorkflowEnvNames().filter(
      (name) => !PLATFORM_PROVIDED.has(name) && !forwards(forwarded, name),
    );
    expect(dropped).toEqual([]);
  });

  it("el propio bloque se lee: encuentra las variables que sabemos que están", () => {
    // Sin esto, un cambio de formato en el YAML convertiría el test anterior
    // en un test sobre la lista vacía, que pasa siempre.
    expect(ciWorkflowEnvNames()).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "PAYLOAD_SECRET",
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
      ]),
    );
  });

  it("reenvía al build el origen, el bucket y la compuerta de publicación", () => {
    const forwarded = turboForwardedNames();
    expect(forwards(forwarded, "VERCEL_PROJECT_PRODUCTION_URL")).toBe(true);
    expect(forwards(forwarded, "S3_ENDPOINT")).toBe(true);
    expect(forwards(forwarded, "COURVIA_PUBLIC_PREVIEW")).toBe(true);
    expect(forwards(forwarded, "COURVIA_EDITORIAL_SOURCE")).toBe(true);
    expect(forwards(forwarded, "WORDPRESS_API_URL")).toBe(true);
  });
});
