/**
 * axe sobre las páginas de verdad, en los tres temas y en RTL.
 *
 * ---------------------------------------------------------------------------
 * QUÉ AÑADE ESTO A LO QUE YA HABÍA
 * ---------------------------------------------------------------------------
 *
 * El repo ya prueba **contraste** de forma exhaustiva y mejor que axe: hay un
 * test por par texto/fondo en los tres temas (`packages/design-tokens`), y
 * falla si un rol nuevo no está definido en los tres. Eso no se toca.
 *
 * Lo que ningún test podía ver es todo lo demás del árbol de accesibilidad,
 * porque no existe hasta que un navegador maqueta la página: nombres
 * accesibles que se pierden al componer, `aria-*` apuntando a ids que el
 * render no emitió, orden de encabezados, regiones sin nombre, controles sin
 * etiqueta. `docs/ARCHITECTURE.md:306` y `docs/operations.md:100` lo pedían
 * desde el principio bajo WP16.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LOS TRES TEMAS Y NO UNO
 * ---------------------------------------------------------------------------
 *
 * Porque el tema no es una capa de pintura: `background: inverse` y
 * `themeScope` **reasignan** los roles de texto y borde
 * (`docs/ARCHITECTURE.md:168`). Una sección puede quedar impecable en `volt`
 * y perder el nombre de una región en `club`, y hasta ahora nadie miraba.
 *
 * Se excluye la regla `color-contrast`: la cubren los tests de tokens, con
 * más precisión y sin depender de que la página tenga texto encima en el
 * momento del barrido. Duplicarla aquí solo añadiría fallos intermitentes.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Los alias que `data-theme` acepta (CLAUDE.md §5). */
const THEMES = ["volt", "carbon", "club"] as const;

const PAGES = [
  { name: "portada", path: "/es" },
  { name: "ficha de producto", path: "/es/robots/tempo-r1" },
  { name: "carrito", path: "/es/carrito" },
];

/**
 * Un barrido de axe, ya filtrado.
 *
 * `wcag2a`/`wcag2aa`/`wcag21aa` son el nivel que el proyecto declara
 * (AA en los tres temas). `color-contrast` fuera, por lo dicho arriba.
 */
function scan(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"]);
}

/** El informe legible: qué regla, cuántos nodos y el primer selector. */
function describe(violations: { id: string; nodes: { target: unknown[] }[] }[]): string {
  return violations
    .map((v) => `${v.id} (${String(v.nodes.length)}× — p.ej. ${String(v.nodes[0]?.target[0])})`)
    .join(" · ");
}

test.describe("accesibilidad AA, tema a tema", () => {
  for (const theme of THEMES) {
    for (const { name, path } of PAGES) {
      test(`${name} en ${theme}`, async ({ page }) => {
        await page.goto(path);
        // El tema se resuelve en servidor desde una cookie y se estampa como
        // `data-theme` en <html> (CLAUDE.md §5). Ponerlo por JS y recargar es
        // lo que hace el selector de tema del sitio.
        await page.evaluate((value) => {
          document.documentElement.setAttribute("data-theme", value);
        }, theme);
        await page.waitForLoadState("networkidle");

        const results = await scan(page).analyze();
        expect(results.violations.length, describe(results.violations)).toBe(0);
      });
    }
  }

  test("la región árabe, en RTL", async ({ page }) => {
    // Una región `prepared` (ADR-025): sin contenido escrito, pero con ruta,
    // dirección y catálogo de mensajes. Es donde un `aria-label` sin traducir
    // o una propiedad física asoman primero.
    await page.goto("/ar-ae");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");

    const results = await scan(page).analyze();
    expect(results.violations.length, describe(results.violations)).toBe(0);
  });
});

test.describe("el teclado llega a todo lo que importa", () => {
  for (const width of [320, 390]) {
    test(`la acción principal sigue disponible en el menú a ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/es");
      const menu = page.locator("details.site-menu");
      await menu.locator("summary.site-menu-toggle").click();
      const cta = menu.locator("a.site-menu-cta");
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", /^\/es(?:\/|$)/u);
      await expect(cta).not.toHaveText("");
    });
  }

  test("la navegación móvil se abre, se recorre con Tab y se cierra con Escape", async ({
    page,
  }) => {
    /*
     * El menú es un `<details>` NATIVO, y eso es una decisión, no un atajo:
     * `mobile-menu.tsx` explica que la tienda tiene que funcionar con el
     * script bloqueado, y sin JS cada enlace es una carga de página completa
     * —que es justo lo que vuelve a cerrar el panel—. El componente cliente
     * solo añade las dos cosas que la plataforma no da: cerrarlo al navegar
     * sin documento nuevo, y Escape.
     *
     * Escape es lo que hay que medir aquí. `<details>` no lo trae, así que es
     * código propio, y hasta ahora se verificaba leyendo el markup: un
     * `addEventListener` puede estar escrito y no llegar a montarse.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/es");
    await page.waitForLoadState("networkidle");

    const menu = page.locator("details.site-menu");
    const toggle = menu.locator("summary.site-menu-toggle");
    await expect(toggle).toBeVisible();
    await expect(menu).not.toHaveAttribute("open", /.*/u);

    await toggle.click();
    await expect(menu).toHaveAttribute("open", /.*/u);

    // Con el panel abierto, el siguiente tabulador tiene que caer DENTRO: si
    // se va al contenido de detrás, quien navega con teclado recorre una
    // página que el panel le está tapando.
    await page.keyboard.press("Tab");
    const focusInside = await menu.evaluate((node) => node.contains(document.activeElement));
    expect(focusInside, "el foco se fue detrás del panel abierto").toBe(true);

    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", /.*/u);

    // Y el foco vuelve al botón, no al principio del documento: perderlo
    // obliga a recorrer la cabecera entera otra vez. El componente lo hace
    // explícitamente (`querySelector("summary")?.focus()`).
    const focusBackOnToggle = await toggle.evaluate((node) => node === document.activeElement);
    expect(focusBackOnToggle, "Escape cerró el menú pero soltó el foco").toBe(true);
  });

  test("el menú desaparece en escritorio, donde la navegación ya está a la vista", async ({
    page,
  }) => {
    // `@media (min-width: 680px) { .site-menu { display: none } }`. Dos
    // navegaciones a la vez serían dos listas de enlaces para un lector de
    // pantalla.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/es");
    await expect(page.locator("details.site-menu")).toBeHidden();
    await expect(page.locator("nav.site-nav-desktop")).toBeVisible();
  });

  test("hay un salto al contenido, y funciona", async ({ page }) => {
    await page.goto("/es");
    await page.keyboard.press("Tab");

    const first = page.locator(":focus");
    const href = await first.getAttribute("href");
    expect(href, "el primer tabulador no es un salto de navegación").toMatch(/^#/);

    // Que exista el destino: un salto al contenido que apunta a un id que
    // nadie emite es peor que no tenerlo — parece accesible y no lo es.
    const target = page.locator(String(href));
    await expect(target).toHaveCount(1);
  });
});
