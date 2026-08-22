/**
 * Las nueve familias, y la palabra que faltaba en dos de ellas.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE TEST ES DE FUENTE Y NO DE NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * `e2e/peso.spec.ts` ya mide el efecto —qué descarga de verdad una página
 * `volt`— y es el guardián que importa. Pero exige un build y un servidor: el
 * ciclo es de minutos, y el fallo llega tarde y lejos de la causa.
 *
 * Esto es la otra mitad: cuenta en el fuente, tarda milisegundos y señala la
 * línea. Los dos hacen falta, y por razones distintas — el de navegador caza
 * lo que el fuente no puede prever (que `next/font` precarga por RUTA y no por
 * tema, que es lo que convirtió dos descuidos en 71 KB en cada página); este
 * caza el descuido antes de que llegue a un build.
 *
 * ---------------------------------------------------------------------------
 * QUÉ PASÓ
 * ---------------------------------------------------------------------------
 *
 * La cabecera de `fonts.ts` afirmaba, desde siempre, «with preload off … a
 * carbon page downloads carbon's three families, not all nine». Era cierta
 * para siete de nueve. Bricolage Grotesque e Instrument Sans no lo fijaban, y
 * `next-font-manifest.json` las listaba para TODAS las rutas de TODAS las
 * regiones.
 *
 * Se lee el fichero como texto en vez de importarlo porque importar
 * `next/font/google` fuera de un build de Next arranca su descargador de
 * fuentes. Aquí lo que se afirma es una propiedad del CÓDIGO, no del módulo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fontsPath = join(import.meta.dirname, "..", "..", "app", "(frontend)", "fonts.ts");

function source(): string {
  return readFileSync(fontsPath, "utf8");
}

/**
 * Las llamadas a un cargador de `next/font/google`, con su cuerpo.
 *
 * Cada familia se declara como `const x = Familia({ … });`. El nombre del
 * cargador es el de Google con guiones bajos, así que sirve de identificador
 * legible en el mensaje de fallo.
 */
function families(): { loader: string; body: string }[] {
  const matches = source().matchAll(/=\s*([A-Z][A-Za-z0-9_]*)\(\{([\s\S]*?)\}\);/gu);
  return [...matches].map((match) => ({ loader: match[1] ?? "", body: match[2] ?? "" }));
}

describe("las tipografías de marca", () => {
  it("son nueve, que es lo que dicen CLAUDE.md §5 y la cabecera del fichero", () => {
    // Si alguien añade una décima, este test la obliga a pasar por la revisión
    // en vez de colarse. Y si la cuenta baja, algo se retiró sin decirlo.
    expect(families().map((family) => family.loader)).toEqual([
      "Anybody",
      "Archivo",
      "IBM_Plex_Mono",
      "Chakra_Petch",
      "IBM_Plex_Sans",
      "Bricolage_Grotesque",
      "Instrument_Sans",
      "Instrument_Serif",
      "IBM_Plex_Sans_Arabic",
    ]);
  });

  it("TODAS fijan `preload: false`, no siete de nueve", () => {
    /*
     * El fallo original, y la forma exacta que tenía: dos familias sin la
     * línea. `next/font` precarga por ruta, así que cada descuido cuesta su
     * peso entero en TODAS las páginas del sitio, esté activo su tema o no.
     * Medido antes del arreglo: 71.140 B por página.
     */
    const sinPreload = families()
      .filter((family) => !/\bpreload:\s*false\b/u.test(family.body))
      .map((family) => family.loader);
    expect(
      sinPreload,
      `estas familias se precargan en TODA ruta, use o no su tema: ${sinPreload.join(", ")}`,
    ).toEqual([]);
  });

  it("ninguna pide más subsets de los que va a pintar", () => {
    // `subsets` decide qué rangos Unicode se descargan. Añadir "cyrillic" a
    // una familia latina multiplica el peso sin que nada lo pinte.
    const SUBSETS_PERMITIDOS = new Set(["latin", "arabic"]);
    for (const family of families()) {
      for (const match of (family.body.match(/subsets:\s*\[([^\]]*)\]/u)?.[1] ?? "").matchAll(
        /"([a-z-]+)"/gu,
      )) {
        const subset = match[1] ?? "";
        expect(
          SUBSETS_PERMITIDOS.has(subset),
          `${family.loader} pide el subset "${subset}", que ningún idioma del sitio usa`,
        ).toBe(true);
      }
    }
  });
});
