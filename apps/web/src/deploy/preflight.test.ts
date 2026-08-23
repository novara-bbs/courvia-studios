/**
 * El preflight se prueba ejecutándolo, no leyéndolo.
 *
 * Es un guardián que corre en el camino crítico de todos los builds: si se
 * equivoca hacia el lado permisivo deja pasar un despliegue roto, y si se
 * equivoca hacia el otro rompe `pnpm build` en el portátil de cualquiera.
 * Las dos mitades importan, así que las dos se ejercitan aquí lanzando el
 * proceso de verdad con entornos distintos — que es lo único que demuestra
 * lo que hace, en vez de lo que dice el fichero que hace.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = join(import.meta.dirname, "..", "..");
// En `scripts/` de la raíz, junto a `vercel-root-guard.mjs`: es la convención
// del repositorio para los guiones sueltos de despliegue, y además los deja
// fuera de lo que recorre dependency-cruiser — un `.mjs` que nadie importa
// dentro de `apps/` dispara su regla `no-orphans`, con razón.
const script = join(appDir, "..", "..", "scripts", "deploy-preflight.mjs");

/** Lanza el preflight con un entorno construido desde cero. */
function run(overrides: Record<string, string>): { code: number; stderr: string } {
  // Un entorno mínimo, no `process.env` filtrado: la máquina que corre este
  // test tiene DATABASE_URL puesta, y heredarla haría pasar el caso que
  // comprueba que se echa en falta.
  // `NODE_ENV` va porque el repositorio amplía `ProcessEnv` para exigirla; el
  // preflight no la mira, así que su valor da igual.
  const env = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
  try {
    execFileSync(process.execPath, [script], { env, stdio: "pipe" });
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: String(failure.stderr ?? "") };
  }
}

describe("el preflight de despliegue", () => {
  it("no molesta en un portátil sin nada configurado", () => {
    // El caso más frecuente y el más fácil de romper: un build local no es un
    // despliegue y no tiene por qué exigir base de datos.
    expect(run({}).code).toBe(0);
  });

  it("tampoco molesta a `vercel dev`, que es un servidor y no un despliegue", () => {
    expect(run({ VERCEL: "1", VERCEL_ENV: "development" }).code).toBe(0);
  });

  it("para un preview de Vercel sin variables, y nombra LAS DOS de una vez", () => {
    const { code, stderr } = run({ VERCEL: "1", VERCEL_ENV: "preview" });
    expect(code).toBe(1);
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).toContain("PAYLOAD_SECRET");
    // La razón de existir del guardián: un fallo por variable cuesta un
    // ciclo de build entero.
    expect(stderr).toContain("faltan 2 de 2");
    // Y dice dónde mirar, incluida la trampa del ámbito.
    expect(stderr).toContain("VERCEL_ENV=preview");
    expect(stderr).toContain("solo Production");
  });

  it("nombra solo lo que queda cuando ya se puso una", () => {
    const { code, stderr } = run({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgres://x",
    });
    expect(code).toBe(1);
    expect(stderr).toContain("faltan 1 de 2");
    expect(stderr).toContain("PAYLOAD_SECRET");
    expect(stderr).not.toContain("    DATABASE_URL");
  });

  it("no habla de ámbitos de Preview cuando el build es de Production", () => {
    // Mandar a alguien a mirar el ámbito equivocado es peor que no decir nada.
    const { stderr } = run({ VERCEL: "1", VERCEL_ENV: "production" });
    expect(stderr).toContain("VERCEL_ENV=production");
    expect(stderr).not.toContain("solo Production");
  });

  it("en CI señala a CI, no al panel de Vercel", () => {
    const { code, stderr } = run({ CI: "true" });
    expect(code).toBe(1);
    expect(stderr).toContain("ci.yml");
    expect(stderr).not.toContain("Settings → Environment Variables");
  });

  it("una variable en blanco cuenta como ausente", () => {
    // En Vercel una variable puede existir con el valor en blanco, y entonces
    // vale la cadena vacía: presente para un `in`, inútil para conectar.
    // (Este comentario evita a propósito escribir la forma literal de una
    // lectura de entorno: env-contract.test.ts escanea también los
    // comentarios, y hace bien — código comentado que lee una variable la
    // sigue necesitando el día que se descomenta.)
    const { code } = run({ VERCEL_ENV: "preview", DATABASE_URL: "  ", PAYLOAD_SECRET: "x" });
    expect(code).toBe(1);
  });

  it("con las dos puestas, deja compilar un preview", () => {
    expect(
      run({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://x", PAYLOAD_SECRET: "s" }).code,
    ).toBe(0);
  });

  /*
   * ---------------------------------------------------------------------
   * EL ORIGEN PÚBLICO, QUE SOLO ES OBLIGATORIO EN PRODUCCIÓN
   * ---------------------------------------------------------------------
   *
   * El preflight decía que `NEXT_PUBLIC_SITE_URL` «llega sola en Vercel» y por
   * eso no la pedía. Es verdad a medias de la forma más cara: la que llega
   * sola es `VERCEL_PROJECT_PRODUCTION_URL`, otra variable, y si el proyecto
   * no expone sus variables de sistema no llega ninguna.
   *
   * Reproducido el 23 ago 2026 con un build de producción limpio:
   *
   *   Error: NEXT_PUBLIC_SITE_URL is not set on a production deploy…
   *   Export encountered an error on /(frontend)/[region]/[slug]/page
   *
   * O sea, 56 segundos de compilación para enterarse. Estas tres pruebas son
   * las que hacen que cueste 30 ms.
   */
  it("un build de producción sin NINGÚN origen no llega a compilar", () => {
    const { code, stderr } = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_URL: "postgres://x",
      PAYLOAD_SECRET: "s",
    });
    expect(code, "el build habría muerto 56 s después en el prerenderizado").toBe(1);
    expect(stderr).toContain("NEXT_PUBLIC_SITE_URL o VERCEL_PROJECT_PRODUCTION_URL");
    // El denominador cuenta el origen solo cuando se exige.
    expect(stderr).toContain("faltan 1 de 3");
  });

  it("y le basta CUALQUIERA de las dos, no las dos", () => {
    // Exigir `NEXT_PUBLIC_SITE_URL` con el respaldo puesto haría fallar builds
    // que funcionan: `siteUrl()` acepta las dos.
    const base = { VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: "x", PAYLOAD_SECRET: "s" };
    expect(run({ ...base, VERCEL_PROJECT_PRODUCTION_URL: "courvia.vercel.app" }).code).toBe(0);
    expect(run({ ...base, NEXT_PUBLIC_SITE_URL: "https://courvia.com" }).code).toBe(0);
  });

  it("pero en preview su ausencia no es un fallo, porque ahí no lanza", () => {
    // Sin origen, `siteUrl()` cae en localhost — correcto para una URL que
    // nadie indexa. Pedirlo aquí convertiría cada rama en un despliegue
    // imposible.
    expect(
      run({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: "x", PAYLOAD_SECRET: "s" }).code,
    ).toBe(0);
  });
});

describe("el preflight y el guardián de prerenderizado no se separan", () => {
  it("clasifican el entorno con las mismas cuatro señales", () => {
    // El preflight es el preludio barato de `src/server/build-env.ts`. Si uno
    // considera despliegue lo que el otro considera local, un build pasa el
    // primero y muere en el segundo — que es justo el ciclo que esto evita.
    const gate = readFileSync(join(appDir, "src", "server", "build-env.ts"), "utf8");
    const preflight = readFileSync(script, "utf8");
    for (const signal of ["VERCEL_ENV", "VERCEL", "CI", "production", "preview"]) {
      expect(preflight, `el preflight ya no mira ${signal}`).toContain(signal);
      expect(gate, `build-env ya no mira ${signal}`).toContain(signal);
    }
    // Y la variable que los dos exigen es la misma.
    expect(preflight).toContain("DATABASE_URL");
    expect(gate).toContain("DATABASE_URL");
  });

  it("el build lo ejecuta de verdad", () => {
    // Un guardián que nadie invoca es un fichero.
    const pkg: unknown = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
    const scripts = (pkg as { scripts: Record<string, string> }).scripts;
    expect(scripts.build).toContain("deploy-preflight.mjs");
    expect(scripts.build).toContain("next build");
  });
});
