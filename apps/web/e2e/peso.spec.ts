/**
 * Lo que un visitante DESCARGA, medido en el navegador.
 *
 * ---------------------------------------------------------------------------
 * EL HUECO QUE CIERRA
 * ---------------------------------------------------------------------------
 *
 * `docs/markets.md:52` fija un presupuesto —«CWV móvil: LCP <2,5 s · INP
 * <200 ms · CLS <0,1»— y hasta hoy no había nada que lo comprobara. El harness
 * de navegador que se montó esta mañana afirma geometría, desbordamiento y
 * árbol de accesibilidad, y ni un byte ni un milisegundo: un cambio que
 * triplicara un chunk o añadiera cuarenta peticiones pasaba en verde.
 *
 * Esto no mide CWV de campo —para eso hace falta tráfico real— pero sí mide lo
 * que los decide: cuántos bytes y cuántas peticiones hay que traer antes de
 * que la página esté, y si alguno de esos bytes no hacía falta.
 *
 * ---------------------------------------------------------------------------
 * LA REGRESIÓN QUE ENCONTRÓ AL ESCRIBIRSE
 * ---------------------------------------------------------------------------
 *
 * Toda página de toda región precargaba **71.140 B de tipografías del tema
 * `club`** —Bricolage Grotesque (41.236 B) e Instrument Sans (29.904 B)— sobre
 * una tienda que sirve `volt`. Medido en el manifiesto del build antes de
 * tocar nada: `next-font-manifest.json` las listaba para las SEIS rutas, y el
 * `<html>` de `/es` clasea solo `anybody`, `archivo` e `ibm_plex_mono`.
 *
 * La causa: de las nueve familias de `app/(frontend)/fonts.ts`, siete fijan
 * `preload: false` y dos se lo dejaron. La cabecera del propio fichero dice
 * «with preload off … a carbon page downloads carbon's three families, not all
 * nine», que era verdad para siete de nueve.
 *
 * Y precargadas significa PRIORIDAD ALTA: por delante de la imagen que decide
 * el LCP.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE MIDE LA FAMILIA Y NO EL NOMBRE DEL FICHERO
 * ---------------------------------------------------------------------------
 *
 * `next/font` sirve las fuentes con nombre de hash: `017d9bea…woff2` cambia en
 * cada build. Afirmar sobre ese nombre sería un test que se rompe al recompilar
 * sin que nada haya cambiado.
 *
 * Lo estable es el CSS: cada `@font-face` declara su `font-family` y su `src`.
 * Se recorre `document.styleSheets` en el navegador, se construye el mapa
 * url → familia, y se cruza con lo que `performance.getEntriesByType("resource")`
 * dice que se descargó de verdad. Así el test habla de «Bricolage Grotesque»,
 * que es el nombre que sale en CLAUDE.md §5, y no de un hash.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Las familias que cada tema declara en CLAUDE.md §5. El test codifica ESA
 * tabla: si alguien añade una familia a un tema, la actualiza aquí y el
 * cambio se ve en la revisión.
 */
const VOLT = ["Anybody", "Archivo", "IBM Plex Mono"];
/** El árabe reasigna los tres roles a su propia familia (`app.css`, `[lang='ar']`). */
const VOLT_AR = [...VOLT, "IBM Plex Sans Arabic"];

/**
 * Los topes, medidos — no números redondos.
 *
 * Con `next start` y compresión, la portada de `/es` transfiere hoy:
 *
 *     total 442.337 B · js 177.437 B · css 13.167 B · 36 peticiones
 *
 * Y transfería 509.830 B antes de quitar la precarga de las dos tipografías
 * del tema `club` (`app/(frontend)/fonts.ts`): 67.493 B menos, un 13 %, y en
 * prioridad de precarga.
 *
 * La holgura es de ~25 %: cabe una sección más y no cabe una librería nueva.
 * Subir uno de estos números es una decisión que se ve en el diff, que es
 * justo lo que un presupuesto compra. `docs/markets.md` fija el objetivo de
 * campo (LCP <2,5 s · INP <200 ms · CLS <0,1); esto vigila lo que lo decide.
 */
const JS_BUDGET = 225_000;
const REQUEST_BUDGET = 45;

interface FetchedFont {
  family: string;
  bytes: number;
  url: string;
}

/**
 * Las fuentes que el navegador llegó a PEDIR, con su familia.
 *
 * `transferSize` es 0 para respuestas de caché, así que se usa
 * `decodedBodySize` como respaldo: aquí interesa «se pidió esto», no el ahorro
 * de compresión.
 */
async function fetchedFonts(page: Page): Promise<FetchedFont[]> {
  return page.evaluate(() => {
    const basename = (url: string): string => {
      const clean = url.split("?")[0] ?? url;
      return clean.slice(clean.lastIndexOf("/") + 1);
    };

    // url → familia, leído de las reglas @font-face que el documento ya tiene.
    const families = new Map<string, string>();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        // Una hoja de otro origen no deja leerse. No tenemos ninguna, pero
        // reventar aquí convertiría un test de peso en un test de CORS.
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style
          .getPropertyValue("font-family")
          .replaceAll(/["']/gu, "")
          .trim();
        const src = rule.style.getPropertyValue("src");
        for (const match of src.matchAll(/url\(([^)]+)\)/gu)) {
          const raw = (match[1] ?? "").replaceAll(/["']/gu, "");
          families.set(basename(raw), family);
        }
      }
    }

    return performance
      .getEntriesByType("resource")
      .filter((entry): entry is PerformanceResourceTiming => "transferSize" in entry)
      .filter((entry) => entry.name.includes(".woff"))
      .map((entry) => ({
        family: families.get(basename(entry.name)) ?? "(familia desconocida)",
        bytes: entry.transferSize > 0 ? entry.transferSize : entry.decodedBodySize,
        url: entry.name,
      }));
  });
}

/** Bytes transferidos por tipo de recurso, tal y como los cuenta el navegador. */
async function weight(page: Page): Promise<{ total: number; js: number; css: number; requests: number }> {
  return page.evaluate(() => {
    const entries = performance
      .getEntriesByType("resource")
      .filter((entry): entry is PerformanceResourceTiming => "transferSize" in entry);
    const size = (entry: PerformanceResourceTiming): number =>
      entry.transferSize > 0 ? entry.transferSize : entry.decodedBodySize;
    return {
      total: entries.reduce((sum, entry) => sum + size(entry), 0),
      js: entries.filter((e) => e.name.includes(".js")).reduce((sum, e) => sum + size(e), 0),
      css: entries.filter((e) => e.name.includes(".css")).reduce((sum, e) => sum + size(e), 0),
      requests: entries.length,
    };
  });
}

function describeFonts(fonts: FetchedFont[]): string {
  return fonts.map((font) => `${font.family} (${String(font.bytes)} B)`).join(" · ");
}

test.describe("lo que se descarga antes de ver la página", () => {
  test("una página volt no baja ni un byte de las fuentes de otro tema", async ({ page }) => {
    /*
     * LA afirmación. Antes de arreglarlo, esta prueba fallaba nombrando las
     * dos culpables, que es lo que un mensaje de fallo tiene que hacer:
     * «Bricolage Grotesque (41236 B) · Instrument Sans (29904 B)».
     */
    await page.goto("/es");
    await page.waitForLoadState("networkidle");

    const theme = await page.locator("html").getAttribute("data-theme");
    expect(theme, "el escenario dejó de servir volt").toBe("volt");

    const fonts = await fetchedFonts(page);
    const intrusas = fonts.filter((font) => !VOLT.includes(font.family));
    expect(
      intrusas.length,
      `una página ${String(theme)} bajó fuentes de otro tema: ${describeFonts(intrusas)}`,
    ).toBe(0);
  });

  test("y la región árabe tampoco, que además añade una familia propia", async ({ page }) => {
    await page.goto("/ar-ae");
    await page.waitForLoadState("networkidle");

    const fonts = await fetchedFonts(page);
    const intrusas = fonts.filter((font) => !VOLT_AR.includes(font.family));
    expect(
      intrusas.length,
      `la región árabe bajó fuentes que no usa: ${describeFonts(intrusas)}`,
    ).toBe(0);
  });

  test("la portada cabe en su presupuesto de bytes y de peticiones", async ({ page }) => {
    /*
     * Los topes salen de una medición, no de un número redondo: ver la
     * constante. Un presupuesto sin holgura es un test que alguien acaba
     * subiendo sin mirar; uno con demasiada no protege. La holgura aquí es
     * ~25 %, suficiente para una sección más y no para una librería nueva.
     */
    await page.goto("/es");
    await page.waitForLoadState("networkidle");

    const medido = await weight(page);
    console.log(`MEDIDO portada: total=${String(medido.total)} js=${String(medido.js)} css=${String(medido.css)} peticiones=${String(medido.requests)}`);
    expect(
      medido.js,
      `el JS de la portada creció a ${String(medido.js)} B transferidos`,
    ).toBeLessThanOrEqual(JS_BUDGET);
    expect(
      medido.requests,
      `la portada hace ${String(medido.requests)} peticiones`,
    ).toBeLessThanOrEqual(REQUEST_BUDGET);
  });
});

/**
 * El elemento que decide el LCP, y si se le puso freno.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE MIDE Y NO SE SUPONE
 * ---------------------------------------------------------------------------
 *
 * «La primera tarjeta es el LCP» es una suposición razonable y puede ser
 * falsa: en una página con un titular grande el LCP es un `<h1>`, y entonces
 * poner `priority` en una imagen añade una precarga que compite con nada.
 * `PerformanceObserver` lo dice sin opinar.
 *
 * La afirmación es general y no depende de qué ruta se mire: **si el elemento
 * que decide el LCP es una imagen, esa imagen no puede ser `loading="lazy"`**.
 * Diferir el candidato a LCP es pedirle al navegador que descubra tarde
 * justamente lo que va a medir Google.
 */
async function largestContentfulPaint(
  page: Page,
): Promise<{ tag: string; lazy: boolean; url: string; size: number } | null> {
  return page.evaluate(async () => {
    return new Promise((resolve) => {
      let last: { tag: string; lazy: boolean; url: string; size: number } | null = null;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lcp = entry as PerformanceEntry & { element?: Element; url?: string; size?: number };
          const element = lcp.element ?? null;
          last = {
            tag: element === null ? "(sin elemento)" : element.tagName.toLowerCase(),
            lazy: element instanceof HTMLImageElement && element.loading === "lazy",
            url: lcp.url ?? "",
            size: lcp.size ?? 0,
          };
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      // El LCP se cierra con la primera interacción; sin ella hay que darle un
      // margen para que llegue la última entrada, que es la que cuenta.
      setTimeout(() => {
        observer.disconnect();
        resolve(last);
      }, 1200);
    });
  });
}

test.describe("el elemento que decide el LCP", () => {
  for (const route of ["/es", "/es/robots", "/es/robots/tempo-r1"]) {
    test(`en ${route} no se descubre tarde`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const lcp = await largestContentfulPaint(page);
      expect(lcp, `${route} no reportó ningún LCP`).not.toBeNull();
      if (lcp === null) return;

      // Se registra el elemento medido: cuando este test falle dentro de seis
      // meses, lo primero que hará falta es saber qué era antes.
      console.log(
        `LCP ${route}: <${lcp.tag}> ${String(lcp.size)} px² ${lcp.url === "" ? "(texto)" : lcp.url}`,
      );
      expect(
        lcp.lazy,
        `el LCP de ${route} es una imagen diferida (${lcp.url}): el navegador la descubre tarde a propósito`,
      ).toBe(false);
    });
  }
});
