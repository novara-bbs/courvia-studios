/**
 * El tema NO vuelve dinámica la tienda, y desde hoy hay quien lo diga.
 *
 * ---------------------------------------------------------------------------
 * LA PROPIEDAD MÁS CARA DEL SISTEMA, SIN GUARDIÁN
 * ---------------------------------------------------------------------------
 *
 * `data-theme` va en el `<html>` que sirve el servidor, así que la pregunta
 * «de dónde sale» decide si la tienda entera se puede prerenderizar. La
 * respuesta correcta es: del CMS, dentro de un ámbito cacheado
 * (`getSiteTheme()` con `"use cache"` + `cacheLife("max")` + `cacheTag`), y
 * NO de una cookie del visitante.
 *
 * Esa propiedad vivía en un comentario. Reintroducir `cookies()` en el layout
 * de región —que es la forma natural de «recordar el tema de cada visitante»,
 * y la que este proyecto tuvo en su día— no ponía en rojo ninguna suite: el
 * único guardián parecido cubre la cabecera y el contador del carrito
 * (`src/cart/cart-session.test.ts`), no el layout ni el tema.
 *
 * El coste de perderla no es un test en rojo: es que las cuatro portadas de
 * región dejan de salir del build como HTML estático y pasan a renderizarse
 * por petición, con la base de datos delante. Se nota en producción, tarde.
 *
 * ---------------------------------------------------------------------------
 * Y UNA LÍNEA DE CLAUDE.md QUE DECÍA LO CONTRARIO
 * ---------------------------------------------------------------------------
 *
 * CLAUDE.md §5 arrastraba: «leer la cookie en el layout raíz fuerza render
 * dinámico de toda la app; aceptado en S0, revisar en S1». Describía código
 * que ya no existe —no hay ningún layout que lea cookies— y contradecía a
 * `docs/ARCHITECTURE.md`. Los dos documentos obligatorios decían cosas
 * opuestas del mismo mecanismo, y CLAUDE.md se lee entero en cada sesión.
 *
 * Se lee el fuente como TEXTO en vez de importarlo: importar el layout
 * arrastraría media app y `"use cache"` no es observable en tiempo de
 * ejecución fuera de un build de Next. Lo que se afirma es una propiedad del
 * código, y por eso se comprueba en el código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(import.meta.dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(join(webRoot, ...segments), "utf8");
}

describe("de dónde sale el tema", () => {
  it("el layout de región no lee cookies ni cabeceras", () => {
    /*
     * `next/headers` en un layout es lo que arrastra a TODA su subrama fuera
     * del prerenderizado. Y el layout de región es la subrama entera del
     * frontend: portadas, listados, fichas, comparador y carrito.
     */
    const layout = read("app", "(frontend)", "[region]", "layout.tsx");
    expect(
      layout,
      "el layout de región lee cookies o cabeceras: la tienda entera deja de prerenderizarse",
    ).not.toContain("next/headers");
  });

  it("y el resolutor del tema tampoco: sale del CMS, cacheado", () => {
    const resolver = read("src", "theme", "get-site-theme.ts");
    expect(resolver).not.toContain("next/headers");
    // Las tres piezas: ámbito cacheado, sin caducidad, e invalidable por tag
    // cuando alguien publica un tema en el panel.
    expect(resolver, "getSiteTheme dejó de ser un ámbito cacheado").toContain('"use cache"');
    expect(resolver).toContain('cacheLife("max")');
    expect(resolver).toContain('cacheTag("theme")');
  });

  it("publicar un tema invalida esa caché, o el cambio no se vería nunca", () => {
    // `cacheLife("max")` sin invalidación sería un tema congelado para
    // siempre: el hook es la otra mitad del contrato.
    const settings = read("src", "payload", "theme-settings.ts");
    expect(
      settings,
      "nadie invalida el tag `theme`: con cacheLife(max), publicar un tema no cambiaría nada",
    ).toContain('revalidateTag("theme"');
  });

  it("y el 404 global lo lee del CMS, no de la constante compilada", () => {
    /*
     * Escribía `data-theme={DEFAULT_THEME}` mientras su propio comentario
     * afirmaba que el documento sigue a la región. Publicar `carbon` revestía
     * el sitio entero MENOS el 404 — la página a la que el proxy manda todo lo
     * que no existe, o sea la que más veces es la primera que alguien ve.
     *
     * Se afirma sobre el fuente por lo mismo que las de arriba: `"use cache"`
     * no es observable fuera de un build de Next.
     */
    const page = read("app", "global-not-found.tsx");
    expect(
      page,
      "el 404 volvió a hornear el tema por defecto: publicar un tema no lo revestiría",
    ).not.toContain("DEFAULT_THEME");
    expect(page).toContain("getSiteTheme()");
  });

  it("ninguna página del frontend se declara dinámica a mano", () => {
    /*
     * `export const dynamic = "force-dynamic"` o un `revalidate` suelto
     * anularían el régimen sin tocar el layout, y es la vía rápida cuando
     * algo no cachea a la primera. Si alguna ruta lo necesita de verdad, que
     * sea una decisión visible en el diff y no un atajo.
     */
    const pages = read("app", "(frontend)", "[region]", "page.tsx");
    for (const escape of ["export const dynamic", "export const revalidate", "force-dynamic"]) {
      expect(pages, `la portada de región usa \`${escape}\``).not.toContain(escape);
    }
  });
});
