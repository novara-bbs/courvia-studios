/**
 * The card's colours come from the theme, not from literals.
 *
 * This is the claim that would rot quietly: satori renders inline styles, and
 * inline styles are exactly where a hex creeps in and nobody notices —
 * stylelint does not read TSX, and a wrong-coloured PNG looks like a design
 * choice. So the element tree is inspected before it is ever rasterized, and
 * every colour in it has to be a value tokens.json actually holds.
 */
import tokens from "@courvia/design-tokens/tokens.json";
import { THEME_ALIAS_LIST, themeColor } from "@courvia/design-tokens";
import type { TokensDocument } from "@courvia/design-tokens";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { OG_SIZE, ogCard } from "./og-card";

const DOC = tokens as TokensDocument;

/** Every colour-ish value in the tree, wherever it sits in the style object. */
function colorsIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) colorsIn(child, found);
    return found;
  }
  if (typeof node !== "object" || node === null) return found;
  const element = node as ReactElement<{ style?: Record<string, unknown>; children?: unknown }>;
  const style = element.props?.style;
  if (style !== undefined) {
    for (const value of Object.values(style)) {
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(/#[0-9A-Fa-f]{3,8}/g)) found.push(match[0]);
    }
  }
  colorsIn(element.props?.children, found);
  return found;
}

const card = (theme: (typeof THEME_ALIAS_LIST)[number]) =>
  ogCard({ theme, title: "Cómo calibramos cada Tempo R1", description: "Ficha por unidad.", url: "courvia.com/es/tecnologia" });

describe("ogCard", () => {
  it("uses only colours the active theme defines", () => {
    for (const theme of THEME_ALIAS_LIST) {
      const allowed = new Set(
        ["bg", "surface", "text", "text-muted", "accent"].map((role) =>
          themeColor(DOC, theme, role).toLowerCase(),
        ),
      );
      const used = colorsIn(card(theme)).map((value) => value.toLowerCase());
      expect(used.length, `${theme}: the card paints no colour at all`).toBeGreaterThan(0);
      for (const color of used) expect(allowed, `${theme} uses ${color}`).toContain(color);
    }
  });

  it("paints a different card per theme", () => {
    // If this ever passes with identical output, the theme argument stopped
    // being read and every site would share one card again.
    const rendered = THEME_ALIAS_LIST.map((theme) => colorsIn(card(theme)).join(","));
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("is the size the social platforms crop to", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
