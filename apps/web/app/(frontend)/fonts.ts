/**
 * Brand webfonts (CLAUDE.md §5), self-hosted at build time via next/font.
 * Each font exposes a CSS variable; app.css maps them onto the --cv-font-*
 * tokens per theme so the token contract stays unchanged.
 */
import {
  Anybody,
  Archivo,
  Bricolage_Grotesque,
  Chakra_Petch,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
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

export const fontVariableClasses = [
  anybody,
  archivo,
  ibmPlexMono,
  chakraPetch,
  ibmPlexSans,
  bricolageGrotesque,
  instrumentSans,
  instrumentSerif,
]
  .map((font) => font.variable)
  .join(" ");
