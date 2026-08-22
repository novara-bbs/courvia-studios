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
    /*
     * `e2e/` es de Playwright, no de Vitest.
     *
     * Los dos recogen `*.spec.ts` por defecto, así que sin esto Vitest carga
     * los ficheros del navegador y muere con «Playwright Test did not expect
     * test.describe() to be called here» — un fallo que no dice en absoluto
     * lo que pasa. Se excluye por carpeta y no por extensión para que el
     * nombre del fichero no sea lo que decide quién lo corre.
     */
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // The adapter contract talks to a real Postgres through Payload; one
    // worker keeps the connection pool sane.
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
