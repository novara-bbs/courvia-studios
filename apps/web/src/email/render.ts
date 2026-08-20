/**
 * The one email layout, rendered from tokens.
 *
 * Two rules shape everything here:
 *
 * 1. **Every value that reaches the markup is escaped.** A lead's name is
 *    attacker-controlled text that we put in an HTML document and mail to a
 *    third party; `<img onerror>` in a name field is the oldest trick there
 *    is. There is exactly one interpolation function and it escapes.
 * 2. **Colours come from `tokens.json`, never from a literal.** The Open
 *    Graph card set this precedent (`src/seo/og-card.tsx`): re-skinning the
 *    brand must not require somebody to remember that emails also have a
 *    palette. Two deliberate exceptions, both shared with that card:
 *    typography, because mail clients do not fetch self-hosted woff2 so the
 *    brand faces cannot travel and a system stack is the honest fallback
 *    rather than a broken @font-face; and the pixel sizes, because there is
 *    no `rem` scale and no custom property to inherit from in an inbox.
 *
 * The theme is the COMPILED default rather than the CMS's active theme. An
 * email renders once and then lives in somebody's inbox forever: reading a
 * value that can change after delivery would only mean the archive and the
 * site disagree, and it would drag a cached database read into a cron tick.
 *
 * Layout is one column of block elements with inline styles. No tables, no
 * media queries, no external CSS: the parts of email HTML that survive
 * Gmail, Outlook and Apple Mail without a rendering matrix behind them.
 */
import tokens from "@courvia/design-tokens/tokens.json";
import { DEFAULT_THEME, themeColor } from "@courvia/design-tokens";
import type { TokensDocument } from "@courvia/design-tokens";
import { LOCALE_DEFINITIONS } from "@courvia/platform";
import type { LocaleId } from "@courvia/platform";

const DOC = tokens as TokensDocument;

const PALETTE = {
  bg: themeColor(DOC, DEFAULT_THEME, "bg"),
  surface: themeColor(DOC, DEFAULT_THEME, "surface"),
  text: themeColor(DOC, DEFAULT_THEME, "text"),
  muted: themeColor(DOC, DEFAULT_THEME, "text-muted"),
  accent: themeColor(DOC, DEFAULT_THEME, "accent"),
  border: themeColor(DOC, DEFAULT_THEME, "border"),
};

/** No mail client fetches our woff2, so the brand faces cannot travel. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type EmailBlock =
  | { kind: "text"; value: string }
  | { kind: "heading"; value: string }
  | { kind: "list"; items: string[] }
  /** Small print: legal basis, privacy link, "ignore this if it was not you". */
  | { kind: "note"; value: string };

export interface EmailDocument {
  locale: LocaleId;
  subject: string;
  /** The one line inboxes show next to the subject. */
  preheader: string;
  blocks: EmailBlock[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The only way a value reaches the markup. `'` included: attribute values
 *  in this document are single-quoted nowhere, but a renderer that escapes
 *  four of five characters is one edit away from being wrong. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraph(value: string, color: string, size: string): string {
  return `<p style="margin:0 0 16px;color:${color};font-size:${size};line-height:1.55">${escapeHtml(value)}</p>`;
}

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "text":
      return paragraph(block.value, PALETTE.text, "16px");
    case "heading":
      return `<p style="margin:24px 0 12px;color:${PALETTE.accent};font-size:13px;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(block.value)}</p>`;
    case "list":
      return `<ul style="margin:0 0 16px;padding-inline-start:20px;color:${PALETTE.text};font-size:16px;line-height:1.55">${block.items
        .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "note":
      return paragraph(block.value, PALETTE.muted, "13px");
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "heading":
      return block.value.toUpperCase();
    default:
      return block.value;
  }
}

export function renderEmail(doc: EmailDocument): RenderedEmail {
  const { tag, dir } = LOCALE_DEFINITIONS[doc.locale];
  const body = doc.blocks.map(blockHtml).join("");

  const html = [
    `<!doctype html>`,
    `<html lang="${escapeHtml(tag)}" dir="${dir}">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.subject)}</title></head>`,
    // The preheader is the line inboxes preview. Hidden in the body so it
    // does not appear twice; without one, clients quote the first paragraph.
    `<body style="margin:0;padding:0;background-color:${PALETTE.bg};font-family:${FONT_STACK}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(doc.preheader)}</div>`,
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px">`,
    `<div style="background-color:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:12px;padding:32px 28px">`,
    body,
    `</div>`,
    `</div>`,
    `</body></html>`,
  ].join("");

  const text = doc.blocks.map(blockText).join("\n\n");

  return { subject: doc.subject, html, text };
}
