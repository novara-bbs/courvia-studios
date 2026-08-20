import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@payload-config": fileURLToPath(new URL("./payload.config.ts", import.meta.url)),
    },
  },
  // Vite 8 transforms with oxc, and oxc reads `jsx` straight out of
  // tsconfig.json — which says "preserve", because Next does the transform
  // itself. Without this override every `.tsx` import fails at parse time,
  // which meant no component in this app could be unit tested at all: a
  // currency bug in product-json-ld.tsx had to ship covered only indirectly.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // The adapter contract talks to a real Postgres through Payload; one
    // worker keeps the connection pool sane.
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
