/**
 * El raíl de compra, MEDIDO — y lo que costó no escribir un test decorativo.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTA PRUEBA SUSTITUYE
 * ---------------------------------------------------------------------------
 *
 * `src/catalog/pdp-template.test.ts` comprueba el raíl leyendo la hoja de
 * estilos y el HTML, y lo dice en su propia cabecera: «that is a containment
 * check, not a measurement, and it would not catch a wrong
 * `inset-block-start`». Tenía razón, y este fichero es la parte que faltaba.
 *
 * ---------------------------------------------------------------------------
 * TRES COSAS QUE HUBO QUE MEDIR ANTES DE PODER AFIRMAR NADA
 * ---------------------------------------------------------------------------
 *
 * **1. La página no llega a scroll 3000.** El comentario de `app.css` guarda
 * la medición original —«at scroll 3000 the rail was still pinned at top 80»—
 * pero la PDP de hoy mide ~1500px de alto con una ventana de 900. La primera
 * versión de este fichero hacía `scrollTo(0, 3000)` sobre una página que no
 * se movía, así que comparaba tres veces la misma posición de reposo. Por eso
 * la ventana de aquí es ANCHA Y CORTA: 1440×400 mantiene las dos columnas y
 * da 3.590px de recorrido.
 *
 * **2. `scroll-behavior: smooth` convierte `scrollTo` en una animación.**
 * `app.css` lo declara en `html`, así que leer `scrollY` justo después
 * devolvía 0 y todas las medidas salían de la posición inicial. Va con
 * `behavior: "instant"`, que es lo que hace un salto de ancla del navegador.
 *
 * **3. El desastre del comentario ya no se reproduce como se escribió.** Con
 * el pegajoso puesto en la CELDA, medido: el raíl NO se sale del hero, porque
 * Chromium lo acota a su contenedor de rejilla y desde `app.css:844` ese
 * contenedor ES `.pdp-hero` («THE TRACKS MOVED FROM THE PAGE TO .pdp-hero»).
 * El raíl que viajaba la página entera era el de cuando las pistas vivían en
 * la página. O sea: la afirmación obvia —«no invade lo de abajo»— pasa con el
 * CSS roto, y escribirla habría sido añadir un test verde que no protege.
 *
 * Lo que SÍ distingue las dos versiones, medido en las dos:
 *
 *   | | correcto | roto |
 *   | `.pdp-rail` (celda) | 128→1496 SIEMPRE | 128→493, 880→1245, 1131→1496 |
 *
 * La celda estirada no se mueve NUNCA; solo se mueve su hijo. Eso es lo que
 * `align-self: stretch` compra, y es lo primero que se pierde si alguien
 * vuelve a poner el `position: sticky` en el elemento de la rejilla.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Un producto del catálogo real; su PDP lleva galería y raíl. */
const PDP = "/es/robots/tempo-r1";

/** Ancha para las dos columnas, corta para que haya recorrido. Ver la nota 1. */
const WIDE_AND_SHORT = { width: 1440, height: 400 };

/** El scroll instantáneo que `scroll-behavior: smooth` impide por defecto. */
async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: "instant" });
  }, top);
}

/** Arriba y abajo del elemento en coordenadas de DOCUMENTO, que no se mueven
 *  con el scroll y por eso permiten comparar posiciones entre medidas. */
async function documentBox(
  page: Page,
  selector: string,
): Promise<{ top: number; bottom: number }> {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (node === null) throw new Error(`no existe ${sel}`);
    const rect = node.getBoundingClientRect();
    return {
      top: Math.round(rect.top + window.scrollY),
      bottom: Math.round(rect.bottom + window.scrollY),
    };
  }, selector);
}

test.describe("el raíl de compra", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE_AND_SHORT);
    await page.goto(PDP);
    // El shell de PPR pinta `loading.tsx` primero y el contenido resuelto
    // llega después EN EL MISMO documento: medir antes encuentra dos raíles.
    await page.waitForLoadState("networkidle");
  });

  test("su celda está estirada y no se mueve; solo se mueve su contenido", async ({ page }) => {
    /*
     * LA afirmación de este fichero. Con el `position: sticky` en la celda en
     * vez de en su hijo, la celda misma viaja con el scroll — medido:
     * 128→493, luego 880→1245, luego 1131→1496. Con `align-self: stretch` y
     * el pegajoso en el hijo, la celda ocupa la fila entera y se queda quieta.
     *
     * Y hace falta que el hijo SÍ se mueva: una celda quieta con un hijo
     * quieto es un raíl que no se pega, que es la otra forma de romperlo.
     */
    const cellAtRest = await documentBox(page, ".pdp-rail");
    const stickyAtRest = await documentBox(page, ".pdp-rail-sticky");

    await scrollTo(page, 800);
    const cellScrolled = await documentBox(page, ".pdp-rail");
    const stickyScrolled = await documentBox(page, ".pdp-rail-sticky");

    expect(cellScrolled, "la celda de la rejilla se movió con el scroll").toEqual(cellAtRest);
    expect(
      stickyScrolled.top,
      "el raíl no se despegó: se quedó donde estaba en vez de acompañar",
    ).toBeGreaterThan(stickyAtRest.top);
  });

  test("al pegarse queda por DEBAJO de la cabecera, no tapado por ella", async ({ page }) => {
    /*
     * Esto es lo que `pdp-template.test.ts` dice que no puede cazar: un
     * `inset-block-start` equivocado. La cabecera es `position: sticky` y mide
     * `--cv-header-block-size`; el raíl usa el MISMO par de tokens que
     * `html { scroll-padding-block-start }`, así que un ancla y el raíl
     * despejan la cabecera por lo mismo.
     *
     * Con `inset-block-start: 0` el raíl quedaría debajo de la barra y la
     * mitad de la caja de compra sería invisible. Se compara contra la
     * cabecera real, no contra el número 80: cambiar un token de espaciado es
     * legítimo y no debe poner esto en rojo.
     */
    await scrollTo(page, 800);

    const headerBottom = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      return header === null ? 0 : Math.round(header.getBoundingClientRect().bottom);
    });
    const stickyTop = await page.evaluate(() => {
      const node = document.querySelector(".pdp-rail-sticky");
      return node === null ? 0 : Math.round(node.getBoundingClientRect().top);
    });

    expect(headerBottom, "la cabecera dejó de ser pegajosa").toBeGreaterThan(0);
    expect(
      stickyTop,
      `el raíl se pega a ${String(stickyTop)} y la cabecera acaba en ${String(headerBottom)}: queda tapado`,
    ).toBeGreaterThanOrEqual(headerBottom);
  });

  test("no sobrepasa el bloque al que pertenece", async ({ page }) => {
    // El límite duro: pase lo que pase con el scroll, el raíl no se pinta
    // sobre lo que hay después del hero (la ficha técnica, el cross-sell).
    for (const y of [800, 1400, 3000]) {
      await scrollTo(page, y);
      const sticky = await documentBox(page, ".pdp-rail-sticky");
      const hero = await documentBox(page, ".pdp-hero");
      expect(
        sticky.bottom,
        `a scroll ${String(y)} el raíl se sale del hero y pisa lo de abajo`,
      ).toBeLessThanOrEqual(hero.bottom + 1);
    }
  });

  test("en móvil no hay dos columnas, así que no hay nada pegado", async ({ page }) => {
    // La regla vive dentro de `@media (min-width: 1180px)`. Afirmar aquí que
    // el raíl se pega sería afirmar lo contrario de lo que el CSS dice.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PDP);
    // `networkidle` no: el `beforeEach` ya cargó esta ruta y una segunda
    // espera de red se queda colgada. Aquí solo hace falta que el elemento
    // exista para leer su estilo computado, y `.first()` porque durante el
    // streaming del shell de PPR hay dos.
    const rail = page.locator(".pdp-rail-sticky").first();
    await rail.waitFor({ state: "attached" });

    const position = await rail.evaluate((node) => getComputedStyle(node).position);
    expect(position, "el raíl se pega en móvil, donde no tiene columna").not.toBe("sticky");
  });
});
