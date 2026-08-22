/**
 * Que ninguna página se desborde en horizontal, medido en un navegador.
 *
 * `src/catalog/product-surfaces.test.ts` lo dice de sí misma: «horizontal
 * overflow at 320px [is a] property of a laid-out page, and this repo has no
 * browser harness (WP16). Those were measured by hand in Chromium; until the
 * harness exists, a CSS-only regression here still ships green».
 *
 * Un desbordamiento horizontal en móvil no es un defecto estético: mete una
 * barra de scroll lateral, descoloca el `position: sticky` de la cabecera y en
 * RTL suele ser el primer síntoma de una propiedad física que se coló donde
 * debía ir una lógica. El stylelint del repo prohíbe las físicas, pero no
 * puede ver una anchura calculada.
 *
 * 320px es el suelo real (iPhone SE 1ª gen y el ancho mínimo que Chrome usa
 * en su emulación); 390 es el móvil moderno más común. Se prueban los dos
 * porque una rejilla puede caber en uno y no en el otro.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Las superficies con maquetación propia. Dos landings del CMS (la home y
 *  la de deporte), una ficha, el carrito y el comparador — que es la más
 *  ancha que existe. */
const ROUTES = ["/es", "/es/padel", "/es/robots/tempo-r1", "/es/carrito", "/es/comparar"];

const WIDTHS = [320, 390];

/** Cuánto se sale, en px. `0` es el único resultado aceptable. */
async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

/**
 * El elemento más ancho que la ventana, para que el fallo diga QUÉ se sale.
 *
 * Sin esto el mensaje es «12 > 0» y encontrar al culpable cuesta una tarde:
 * hay que ir bisecando secciones a mano. Con esto el fallo trae el selector.
 */
async function widestOffender(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    let worst = { selector: "(ninguno)", width: 0 };
    for (const node of document.querySelectorAll<HTMLElement>("body *")) {
      const rect = node.getBoundingClientRect();
      const right = rect.right;
      if (right > limit + 1 && rect.width > worst.width) {
        const id = node.id ? `#${node.id}` : "";
        const cls = node.className && typeof node.className === "string"
          ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}`
          : "";
        worst = { selector: `${node.tagName.toLowerCase()}${id}${cls}`, width: rect.width };
      }
    }
    return `${worst.selector} (${String(Math.round(worst.width))}px de ancho)`;
  });
}

test.describe("nada se sale por el lado", () => {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} a ${String(width)}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route);
        // El contenido diferido de PPR llega después del shell; medir antes
        // sería medir media página.
        await page.waitForLoadState("networkidle");

        const overflow = await overflowOf(page);
        if (overflow > 0) {
          const offender = await widestOffender(page);
          expect(overflow, `${route} se sale ${String(overflow)}px — el peor: ${offender}`).toBe(0);
        }
        expect(overflow).toBe(0);
      });
    }
  }

  test("tampoco en RTL, que es donde una propiedad física se nota", async ({ page }) => {
    // `ar-ae` es una región PREPARADA (ADR-025): su ruta, su dirección y su
    // catálogo de mensajes existen y el build los ejercita, aunque el
    // contenido no esté escrito. Justo por eso el layout tiene que aguantar.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar-ae");
    await page.waitForLoadState("networkidle");

    const dir = await page.locator("html").getAttribute("dir");
    expect(dir, "la región árabe dejó de servirse en RTL").toBe("rtl");

    const overflow = await overflowOf(page);
    if (overflow > 0) {
      const offender = await widestOffender(page);
      expect(overflow, `/ar-ae se sale ${String(overflow)}px — el peor: ${offender}`).toBe(0);
    }
    expect(overflow).toBe(0);
  });
});
