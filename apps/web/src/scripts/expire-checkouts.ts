/**
 * Operational sweep: cancels `pending_payment` checkouts older than one hour
 * and releases their stock reservations. Run it from cron (Vercel Cron or
 * GitHub Actions schedule) or by hand:
 *
 *   pnpm --filter @courvia/web sweep:checkouts
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { expireStaleCheckouts } = await import("@courvia/commerce-payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });
const result = await expireStaleCheckouts(payload);
console.log(
  `checkout sweep: ${result.scanned} scanned · ${result.expired} expired · ${result.skipped} skipped`,
);
process.exit(0);
