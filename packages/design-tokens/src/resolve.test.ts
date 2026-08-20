import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { themeColor } from "./resolve";
import { COLOR_ROLES } from "./semantic-contract";
import { THEME_ALIAS_LIST } from "./types";
import type { TokensDocument } from "./types";

const doc = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "tokens.json"), "utf8"),
) as TokensDocument;

/**
 * `themeColor` exists so that a renderer with no CSS at all — the Open Graph
 * card is painted by satori, which never sees a stylesheet — can still take
 * its colours from the same tokens as the site. If it silently returned
 * something unresolved, every shared link would carry a card whose
 * background is the literal string "{global.color.court.950}".
 */
describe("themeColor", () => {
  it("resolves every contract role to a literal colour in every theme", () => {
    for (const theme of THEME_ALIAS_LIST) {
      for (const role of COLOR_ROLES) {
        const value = themeColor(doc, theme, role);
        expect(value, `${theme}/${role}`).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
      }
    }
  });

  it("follows a reference instead of returning the reference", () => {
    // volt's bg is {global.color.court.950}; the caller must get the hex.
    expect(themeColor(doc, "volt", "bg")).not.toContain("{");
  });

  it("gives each theme its own accent", () => {
    const accents = THEME_ALIAS_LIST.map((theme) => themeColor(doc, theme, "accent"));
    expect(new Set(accents).size).toBe(accents.length);
  });

  it("throws on a role no theme defines, rather than inventing a colour", () => {
    expect(() => themeColor(doc, "volt", "not-a-role")).toThrow(/not found/);
  });
});
