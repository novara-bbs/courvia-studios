/**
 * Paragraphs -> the editor's document format.
 *
 * A starter declares prose as strings (packages/sections/src/starters.ts)
 * because that package is not allowed to know which editor this app chose —
 * the same boundary that makes the renderer take `renderRichText` as an
 * injected function. This is the other side of that injection, and it lives
 * in the app for the same reason: swapping Lexical for something else should
 * touch this file and no starter.
 */

/** Content locales, which are also the languages a starter is written in. */
type Locale = "ar" | "en" | "es";

interface LexicalNode {
  type: string;
  version: number;
  [key: string]: unknown;
}

/**
 * Arabic runs right to left, and the direction is stored ON the node.
 *
 * Not cosmetic: Lexical writes `direction` into the document and the
 * serializer honours it, so a paragraph seeded as "ltr" would render Arabic
 * prose left-aligned inside an otherwise correct RTL page — the exact class
 * of hand-mixed direction .claude/rules/content-voice.md rules out.
 */
function direction(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

function paragraph(text: string, locale: Locale): LexicalNode {
  return {
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    direction: direction(locale),
    children: [{ type: "text", text, version: 1 }],
  };
}

/** A Lexical document of one paragraph per string. */
export function starterRichText(paragraphs: string[], locale: Locale): unknown {
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: direction(locale),
      children: paragraphs.map((text) => paragraph(text, locale)),
    },
  };
}
