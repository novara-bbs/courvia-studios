import tokens from "@courvia/design-tokens/tokens.json";
import { DEFAULT_THEME, themeColor } from "@courvia/design-tokens";
import type { TokensDocument } from "@courvia/design-tokens";
import { describe, expect, it } from "vitest";

import {
  SKETCH_GRID,
  SKETCH_ROLES,
  THUMBNAIL_SIZE,
  sketchColor,
  sketchDataUri,
  sketchSvg,
} from "./thumbnail";
import type { Sketch } from "./thumbnail";

const DOC = tokens as TokensDocument;
const ONE: Sketch = [{ role: "accent", x: 1, y: 1, w: 2, h: 2 }];

describe("sketch geometry", () => {
  it("is 3:2, the ratio the drawer tile declares", () => {
    expect(THUMBNAIL_SIZE.width / THUMBNAIL_SIZE.height).toBe(1.5);
    // `object-fit: cover` on a 3:2 tile crops anything that is not 3:2, and
    // the crop lands on the content that identifies the section.
    expect(sketchSvg(ONE)).toContain(`viewBox="0 0 480 320"`);
  });

  it("maps grid units to pixels, so a full-bleed shape covers the tile", () => {
    const full = sketchSvg([{ role: "media", x: 0, y: 0, w: 12, h: 8 }]);
    expect(full).toContain(`x="0" y="0" width="480" height="320"`);
  });

  it("refuses a shape that falls off the grid instead of drawing nothing", () => {
    // An out-of-bounds rect is not an error in SVG: it renders outside the
    // viewBox and the tile comes out empty, which looks exactly like a
    // section that declared no thumbnail at all.
    expect(() => sketchSvg([{ role: "text", x: 11, y: 1, w: 3, h: 1 }])).toThrowError(/off the/);
    expect(() => sketchSvg([{ role: "text", x: 1, y: 7.5, w: 1, h: 2 }])).toThrowError(/off the/);
    expect(() => sketchSvg([{ role: "text", x: -1, y: 1, w: 1, h: 1 }])).toThrowError(/off the/);
    expect(() => sketchSvg([{ role: "text", x: 1, y: 1, w: 0, h: 1 }])).toThrowError(/off the/);
  });

  it("refuses an empty sketch", () => {
    expect(() => sketchSvg([])).toThrowError(/at least one shape/);
  });
});

describe("every colour comes from a token", () => {
  it("paints each role with the default theme's own value", () => {
    for (const [role, tokenRole] of Object.entries(SKETCH_ROLES)) {
      expect(sketchColor(role as keyof typeof SKETCH_ROLES)).toBe(
        themeColor(DOC, DEFAULT_THEME, tokenRole),
      );
    }
  });

  it("writes no colour the token document does not contain", () => {
    // The observable version of "no hex is written here": every fill in the
    // generated SVG must be a value some theme role resolves to. A literal
    // typed into a sketch would fail this even if it looked on-brand.
    const svg = sketchSvg([
      { role: "surface", x: 0, y: 0, w: 12, h: 8 },
      { role: "raised", x: 1, y: 1, w: 2, h: 2 },
      { role: "media", x: 4, y: 1, w: 2, h: 2 },
      { role: "accent", x: 7, y: 1, w: 2, h: 2 },
      { role: "onAccent", x: 7.5, y: 1.5, w: 1, h: 1 },
      { role: "text", x: 1, y: 4, w: 2, h: 1 },
      { role: "muted", x: 4, y: 4, w: 2, h: 1 },
      { role: "rule", x: 7, y: 4, w: 2, h: 0.2 },
    ]);
    const known = new Set(
      ["bg", ...Object.values(SKETCH_ROLES)].map((role) =>
        themeColor(DOC, DEFAULT_THEME, role).toLowerCase(),
      ),
    );
    const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map(([, value]) =>
      (value ?? "").toLowerCase(),
    );
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) expect(known, `unknown fill ${fill}`).toContain(fill);
  });
});

describe("data URI", () => {
  it("is an inline SVG the admin's CSP already allows", () => {
    const uri = sketchDataUri(ONE);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(sketchSvg(ONE));
  });

  it("percent-encodes the characters that would end the attribute early", () => {
    const uri = sketchDataUri(ONE);
    // A raw '#' from a hex colour truncates the URI at the fragment; a raw
    // '"' closes the src attribute. Neither may survive encoding.
    expect(uri).not.toContain("#");
    expect(uri).not.toContain('"');
    expect(uri).not.toContain("<");
  });

  it("is deterministic, so a redeploy does not churn every block config", () => {
    expect(sketchDataUri(ONE)).toBe(sketchDataUri(ONE));
  });

  it("stays small enough to ship inline in the client config", () => {
    // Nineteen of these travel with the admin config. A kilobyte each is
    // fine; a hundred would not be.
    const big: Sketch = Array.from({ length: 20 }, (_, index) => ({
      role: "muted" as const,
      x: 0,
      y: index * 0.4,
      w: 12,
      h: 0.3,
    }));
    expect(sketchDataUri(big).length).toBeLessThan(4096);
  });
});

describe("the grid is the one the sketches are written against", () => {
  it("is 12 x 8", () => {
    expect(SKETCH_GRID).toEqual({ columns: 12, rows: 8 });
  });
});
