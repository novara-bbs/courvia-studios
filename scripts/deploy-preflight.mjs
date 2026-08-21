#!/usr/bin/env node
/**
 * Lo que un build de despliegue necesita, comprobado ANTES de compilar.
 *
 * El motivo es un ciclo medido. Sin esto, un despliegue sin variables
 * compila los catorce paquetes durante 56 segundos, llega al
 * prerenderizado, y muere nombrando UNA variable: `DATABASE_URL`. La otra
 * que falta, `PAYLOAD_SECRET`, sale enterrada como `[cause]` de esa primera
 * excepción. Quien lee el log pone la primera, redespliega, y espera otros
 * 56 segundos para enterarse de la segunda.
 *
 * Esto no sustituye al guardián de `src/server/build-env.ts`, que es el que
 * de verdad impide hornear un catálogo vacío en una caché de treinta días.
 * Es su preludio barato: la misma política, comprobada cuando cuesta 30 ms
 * en vez de 56 segundos, y nombrando TODO lo que falta de una vez.
 *
 * Node pelado y sin importaciones a propósito: corre en el camino crítico de
 * cada build, y `tsx` costaría más que la comprobación entera.
 */

/** Vacío y ausente son lo mismo: en Vercel una variable puede existir en blanco. */
function env(name) {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

/**
 * Dónde acaba la salida de este build. Las mismas reglas que
 * `buildAudience()` en `src/server/build-env.ts`, y hay un test que compara
 * las dos listas para que no se separen.
 */
function audience() {
  const vercelEnv = env("VERCEL_ENV");
  if (vercelEnv === "production" || vercelEnv === "preview") return "deployment";
  // `vercel dev` es un servidor de desarrollo, no un despliegue. Pero un
  // proyecto con las variables de sistema desactivadas no tiene VERCEL_ENV y
  // sí VERCEL, y su salida SÍ se sirve.
  if (vercelEnv === undefined && env("VERCEL") !== undefined) return "deployment";
  if (env("CI") !== undefined) return "ci";
  return "local";
}

/**
 * Las dos que hacen fallar el build, y solo esas dos.
 *
 * Deliberadamente corta. `NEXT_PUBLIC_SITE_URL` llega sola en Vercel;
 * `CRON_SECRET`, las de S3 y las de correo tienen ausencia SIGNIFICATIVA —
 * sin ellas la función se desactiva a propósito, no se rompe— y meterlas
 * aquí convertiría un despliegue de prueba en imposible.
 */
const REQUIRED = [
  {
    name: "DATABASE_URL",
    why: "sin base de datos el build prerenderiza un catálogo vacío bajo cacheLife(\"max\") y lo sirve 30 días",
  },
  {
    name: "PAYLOAD_SECRET",
    why: "firma las sesiones y las cookies de previsualización; sin ella Payload no arranca",
  },
];

const where = audience();
if (where === "local") process.exit(0);

const missing = REQUIRED.filter((variable) => env(variable.name) === undefined);
if (missing.length === 0) process.exit(0);

const vercelEnv = env("VERCEL_ENV");
const scope =
  where === "ci"
    ? "CI las declara en .github/workflows/ci.yml contra su propio Postgres, y turbo.json las\n  reenvía en globalPassThroughEnv. Una de las dos las ha perdido — ver docs/operations.md."
    : `Ponlas para ESTE entorno en el proyecto de Vercel (Settings → Environment Variables;\n  VERCEL_ENV=${vercelEnv ?? "sin definir"}).${
        vercelEnv === "production"
          ? ""
          : "\n  Una variable con ámbito solo Production NO existe en ningún build de Preview,\n  que es la forma habitual de llegar aquí."
      }\n  Ver docs/deployment.md.`;

console.error(
  [
    "",
    `  Este build no puede desplegarse: faltan ${String(missing.length)} de ${String(REQUIRED.length)} variables obligatorias.`,
    "",
    ...missing.map((variable) => `    ${variable.name}\n      ${variable.why}`),
    "",
    `  ${scope}`,
    "",
    "  Se comprueba aquí, antes de compilar, porque hacerlo después cuesta 56 segundos",
    "  por variable: el build muere en el prerenderizado nombrando solo la primera.",
    "",
  ].join("\n"),
);
process.exit(1);
