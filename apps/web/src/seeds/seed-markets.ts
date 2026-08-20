/**
 * Seeds MarketSettings with the ADR-14 defaults: the three markets enabled,
 * stripe offered in all of them, tabby/tamara pre-listed for AE but
 * disabled until their adapters land (S4). Idempotent: refuses to overwrite
 * a non-empty global.
 *
 *   pnpm --filter @courvia/web seed:markets
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

const current = await payload.findGlobal({ slug: "market-settings", depth: 0 });
if ((current.markets ?? []).length > 0) {
  console.error("Refusing to seed: market-settings already has markets configured.");
  process.exit(1);
}

await payload.updateGlobal({
  slug: "market-settings",
  data: {
    markets: [
      { market: "es", enabled: true, paymentProviders: [{ provider: "stripe", enabled: true }] },
      { market: "uk", enabled: true, paymentProviders: [{ provider: "stripe", enabled: true }] },
      {
        market: "ae",
        enabled: true,
        paymentProviders: [
          { provider: "stripe", enabled: true },
          { provider: "tabby", enabled: false },
          { provider: "tamara", enabled: false },
        ],
      },
    ],
  },
});

console.log("MarketSettings seeded (es/uk/ae · stripe enabled; tabby/tamara staged).");
process.exit(0);
