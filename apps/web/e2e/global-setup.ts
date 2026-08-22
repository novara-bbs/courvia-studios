/**
 * El escenario del recorrido, montado en otro proceso.
 *
 * Playwright NO puede usar la Local API de Payload: su cargador de ESM no
 * resuelve `next/cache` desde `src/payload/commerce-connections.ts` —medido:
 * `Cannot find module .../next/cache`—. Así que la semilla corre como el
 * resto de semillas, con `tsx`, y aquí solo se la espera.
 *
 * Que el test no tenga Local API es una restricción con premio: lo obliga a
 * hablar por HTTP, que es la misma puerta que usa una persona con el panel
 * abierto y la única capa donde `overrideAccess: true` deja de mentir.
 */
import { execFileSync } from "node:child_process";

export default function globalSetup(): void {
  execFileSync("pnpm", ["run", "seed:e2e-operator"], {
    stdio: "inherit",
    // El paquete, no el directorio de `e2e/`.
    cwd: new URL("..", import.meta.url).pathname,
  });
}
