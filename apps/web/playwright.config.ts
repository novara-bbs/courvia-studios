/**
 * El harness de navegador (WP16 · Fase 8 del plan dual-commerce).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE, Y QUÉ DEJA DE SER CIERTO AL EXISTIR
 * ---------------------------------------------------------------------------
 *
 * Cuatro suites de este repo llevaban escrito que NO podían verificar lo que
 * más se rompe, y que lo medido lo fue a mano:
 *
 *   «until the harness exists, a CSS-only regression here still ships green»
 *   — src/catalog/product-surfaces.test.ts
 *
 *   «would not catch a wrong `inset-block-start`»
 *   — src/catalog/pdp-template.test.ts, sobre el raíl pegajoso
 *
 * Con tres temas, RTL y un raíl cuya mecánica costó medirla —Chromium acota un
 * elemento pegajoso de rejilla al contenedor, no a su celda—, eso no era una
 * carencia teórica: era una regresión de CSS pasando en verde.
 *
 * Lo que este harness añade es lo que Vitest no puede dar por construcción:
 * una PÁGINA MAQUETADA. Geometría computada, desbordamiento real, foco real,
 * y el árbol de accesibilidad que axe recorre.
 *
 * ---------------------------------------------------------------------------
 * UN SERVIDOR, NO SIETE
 * ---------------------------------------------------------------------------
 *
 * Siete suites de Vitest arrancan cada una su propio `next start` en su propio
 * puerto (3987-3992). Funciona, pero cuesta siete arranques por `pnpm test` y
 * ya produjo un choque latente: `pdp-template.test.ts` y
 * `home-preview.http.test.ts` eligieron AMBAS el 3992, y el comentario de cada
 * una enumera los puertos que evita sin mencionar a la otra. Hoy no explota
 * solo porque `vitest.config.ts` fija `maxWorkers: 1`.
 *
 * Aquí el servidor lo gestiona Playwright: uno, reutilizable entre ficheros,
 * en un puerto que no pisa ninguno de esos siete.
 *
 * ---------------------------------------------------------------------------
 * EL NAVEGADOR: EL DE LA MÁQUINA SI LO HAY, EL SUYO SI NO
 * ---------------------------------------------------------------------------
 *
 * Este contenedor trae Chromium preinstalado (build 1194) y Playwright 1.62
 * espera la 1234. Fijar la ruta a ciegas rompería CI, donde `/opt/pw-browsers`
 * no existe; no fijarla obliga a descargar ~170 MB en cada sesión de
 * desarrollo. Así que se DETECTA: si el binario preinstalado está ahí se usa
 * —comprobado, conduce esta versión y mide `boundingBox` correctamente—, y si
 * no, Playwright usa el que `playwright install` le puso.
 *
 * La consecuencia de que la build no coincida está acotada: se miden layout y
 * accesibilidad, no huellas de píxeles. Una regresión visual por captura
 * exigiría fijar la build, y por eso NO se hace aquí (ver docs/operations.md
 * §13: la regresión visual va con Storybook, no con esto).
 */
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/** Ninguno de los siete que ya usan las suites de Vitest (3987-3992). */
const PORT = 3999;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

/** El Chromium de la máquina, si esta máquina trae uno. */
const PREINSTALLED = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = existsSync(PREINSTALLED) ? PREINSTALLED : undefined;

export default defineConfig({
  testDir: "./e2e",
  /*
   * El escenario del recorrido de un pedido: un operador con sesión y un
   * pedido pagado esperando a que alguien lo prepare. Corre en otro proceso
   * porque Playwright no puede cargar la Local API de Payload — ver
   * `e2e/global-setup.ts`.
   */
  globalSetup: "./e2e/global-setup.ts",
  /*
   * En serie, y a propósito. Estas pruebas comparten un servidor y una base de
   * datos, y varias miden geometría: dos páginas compitiendo por CPU producen
   * medidas de scroll que no se reproducen. La lentitud es el precio de que un
   * fallo signifique algo.
   */
  workers: 1,
  fullyParallel: false,
  /*
   * Cero reintentos, también en CI. Un reintento convierte una prueba
   * intermitente en una prueba verde, y este repo ya decidió que «flake» no es
   * una causa raíz (.claude/rules y el runbook de PRs dicen lo mismo).
   */
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI === "true" ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    ...devices["Desktop Chrome"],
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
    // Solo al fallar: una traza por prueba verde son megabytes que nadie abre.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // `next start`, no `next dev`: se mide lo que se sirve, no lo que se
    // recompila. Exige un build previo, igual que las suites HTTP de Vitest.
    command: `node node_modules/next/dist/bin/next start -p ${String(PORT)}`,
    url: `${BASE_URL}/es`,
    // Reutiliza un servidor ya levantado en desarrollo; en CI siempre arranca
    // uno limpio para que nadie herede el estado de otra ejecución.
    reuseExistingServer: process.env.CI !== "true",
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
