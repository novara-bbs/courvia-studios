/**
 * The Open Graph card a page gets when nobody uploaded one.
 *
 * GENERATED rather than a static brand asset, and the reason is the bug this
 * closes. The complaint in docs/gap-analysis.md is not "there is no image",
 * it is that "cada vez que alguien comparte una landing en WhatsApp sale la
 * misma tarjeta genérica" — and a single PNG in the repo is exactly that
 * card, just prettier. A generated one carries the page's own title and
 * description, so two landings never share a preview, and it takes its
 * colours from the ACTIVE theme's tokens, so switching the site to carbon
 * re-skins every social preview without a designer exporting anything.
 *
 * Under Cache Components these routes are prerendered and cached like any
 * other (`next/dist/server/og/cache-image-response.js`), so the cost is one
 * render per page per publish, not one per share.
 *
 * KNOWN LIMIT, stated rather than hidden: the card is typeset in the face
 * `next/og` bundles, not in Anybody/Chakra Petch/Bricolage. satori accepts
 * only ttf/otf/woff and `next/font/google` self-hosts woff2, so putting the
 * brand face here means committing three binaries (one display face per
 * theme) into a renderer with a documented 500 KB bundle ceiling. Colour,
 * layout and copy are on-brand; the letterforms are not yet.
 */
import tokens from "@courvia/design-tokens/tokens.json";
import { themeColor } from "@courvia/design-tokens";
import type { ThemeAlias, TokensDocument } from "@courvia/design-tokens";
import type { ReactElement } from "react";

const DOC = tokens as TokensDocument;

/** Facebook's and X's shared sweet spot; also next/og's default. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export interface OgCardInput {
  theme: ThemeAlias;
  title: string;
  description: string;
  /** The URL the card belongs to, shown as a footer: "courvia.com/es/tecnologia". */
  url: string;
}

/**
 * Flexbox only, every box explicit: satori implements a subset of CSS and
 * silently ignores `display: grid`, so a layout that looks fine in a browser
 * can come out as a stack of overlapping text.
 */
export function ogCard({ theme, title, description, url }: OgCardInput): ReactElement {
  const bg = themeColor(DOC, theme, "bg");
  const surface = themeColor(DOC, theme, "surface");
  const text = themeColor(DOC, theme, "text");
  const muted = themeColor(DOC, theme, "text-muted");
  const accent = themeColor(DOC, theme, "accent");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: bg,
        // The one gradient in the system, and it is two theme tokens rather
        // than the purple-to-cyan default of every generated card.
        backgroundImage: `linear-gradient(135deg, ${bg} 45%, ${surface} 100%)`,
        padding: "72px 80px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            width: 20,
            height: 20,
            borderRadius: 999,
            backgroundColor: accent,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: text,
          }}
        >
          Courvia
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 48 ? 62 : 78,
            lineHeight: 1.08,
            color: text,
          }}
        >
          {title}
        </div>
        {description === "" ? null : (
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: muted }}>
            {description}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", width: 96, height: 6, backgroundColor: accent }} />
        <div style={{ display: "flex", fontSize: 26, color: muted }}>{url}</div>
      </div>
    </div>
  );
}
