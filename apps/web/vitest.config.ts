import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@payload-config": fileURLToPath(new URL("./payload.config.ts", import.meta.url)),
    },
  },
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
