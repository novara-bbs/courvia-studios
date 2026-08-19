/**
 * Brand webfonts, self-hosted at build time via next/font.
 *
 * Each page loads ONLY its active theme's families (3) plus the Arabic
 * family when the locale needs it — not all eight brands fonts on every
 * request. app.css maps the variables onto the --cv-font-* tokens.
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

const anybody = Anybody({ subsets: ["latin"], variable: "--font-anybody" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra-petch",
});
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
});
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage-grotesque",
});
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
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
