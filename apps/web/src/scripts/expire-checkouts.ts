/**
 * Operational sweep, by hand:
 *
 *   pnpm --filter @courvia/web sweep:checkouts
 *
 * The scheduled path is `/next/cron` (see apps/web/vercel.json); this entry
 * point exists so the same sweep can be run against a local database, or
 * against a deployment from an operator's laptop, without waiting for a
 * cron tick. Both call `sweepStaleCheckouts`.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { sweepStaleCheckouts } = await import("./sweep-checkouts");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });
const result = await sweepStaleCheckouts(payload);
console.log(
  `checkout sweep: ${result.scanned} scanned · ${result.expired} expired · ${result.skipped} skipped`,
);
process.exit(0);
