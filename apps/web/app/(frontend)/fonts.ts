/**
 * Brand webfonts, self-hosted at build time via next/font.
 *
 * Each page CLASSES only its active theme's families, and with preload off
 * the browser fetches a font at CSS-discovery time only when a --cv-font-*
 * variable actually applies it — so a carbon page downloads carbon's three
 * families, not all nine faces. next/font's default display:swap covers the
 * brief unstyled interval. app.css maps the variables onto the tokens.
 *
 * «With preload off» tiene que valer para las NUEVE, y durante meses valió
 * para siete: Bricolage Grotesque e Instrument Sans se lo dejaron y viajaban
 * precargadas en toda ruta. La afirmación de arriba era exactamente el tipo
 * de comentario que este repo persigue —declara la intención, no el efecto—,
 * así que ahora hay dos guardianes: `fonts.test.ts` cuenta las nueve en el
 * fuente, y `e2e/peso.spec.ts` mira lo que el navegador descarga.
 */
import type { ThemeAlias } from "@courvia/design-tokens";
import type { LocaleId } from "@courvia/platform";
import {
  Anybody,
  Archivo,
  Bricolage_Grotesque,
  Chakra_Petch,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  Instrument_Sans,
  Instrument_Serif,
} from "next/font/google";

const anybody = Anybody({ subsets: ["latin"], preload: false, variable: "--font-anybody" });
const archivo = Archivo({ subsets: ["latin"], preload: false, variable: "--font-archivo" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  preload: false,
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  preload: false,
  weight: ["500", "600", "700"],
  variable: "--font-chakra-petch",
});
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  preload: false,
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
});
/*
 * `preload: false` en las dos, desde el 22 ago 2026, y no es cosmética.
 *
 * Eran las ÚNICAS dos de las nueve que se lo habían dejado, y el efecto no era
 * local: `next/font` precarga por RUTA, no por tema, así que estas dos salían
 * en el hint de precarga de TODAS las rutas de TODAS las regiones. Medido en
 * el navegador antes de tocarlo: una portada `volt` —que clasea Anybody,
 * Archivo e IBM Plex Mono y ninguna de estas— descargaba
 * «Bricolage Grotesque (41536 B) · Instrument Sans (30204 B)».
 *
 * 71 KB con prioridad de precarga, o sea por delante de la imagen que decide
 * el LCP, para un tema que no está activo. Lo vigila `e2e/peso.spec.ts`, que
 * cruza las @font-face del CSS con lo que el navegador pidió de verdad.
 */
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  preload: false,
  variable: "--font-bricolage-grotesque",
});
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  preload: false,
  variable: "--font-instrument-sans",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  preload: false,
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans-arabic",
});

const FONTS_BY_THEME: Record<ThemeAlias, Array<{ variable: string }>> = {
  volt: [anybody, archivo, ibmPlexMono],
  carbon: [chakraPetch, ibmPlexSans, ibmPlexMono],
  club: [bricolageGrotesque, instrumentSans, instrumentSerif, ibmPlexMono],
};

export function fontClassesFor(theme: ThemeAlias, locale: LocaleId): string {
  const fonts = [...FONTS_BY_THEME[theme]];
  if (locale === "ar") fonts.push(ibmPlexSansArabic);
  return fonts.map((font) => font.variable).join(" ");
}
