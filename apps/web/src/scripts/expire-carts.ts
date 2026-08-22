/**
 * Operational sweep, by hand:
 *
 *   pnpm --filter @courvia/web sweep:carts
 *
 * Gemelo de `expire-checkouts.ts`. El camino programado es `/next/cron`
 * (`apps/web/vercel.json`); esta entrada existe para poder correr la MISMA
 * barrida contra una base local, o contra un despliegue desde el portátil de
 * quien opera, sin esperar a un tick.
 *
 * Y no era simetría: `sweep:checkouts` existía y este NO, así que el escape
 * manual de los carritos vencidos no existía. Se descubrió al escribir el
 * runbook de salud, que lo daba por hecho — la clase de hueco que solo aparece
 * cuando alguien intenta seguir sus propias instrucciones.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { sweepStaleCarts } = await import("./sweep-carts");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });
const result = await sweepStaleCarts(payload);
console.log(`cart sweep: ${String(result.deleted)} deleted`);
process.exit(0);
