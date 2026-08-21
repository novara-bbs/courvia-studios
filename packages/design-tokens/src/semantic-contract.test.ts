import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildCss, flattenGroup, resolveToken } from "./build-css";
import {
  AA_NORMAL_TEXT,
  CONTRAST_PAIRS,
  COLOR_ROLES,
  FONT_ROLES,
  REQUIRED_ROLES,
} from "./semantic-contract";
import { THEME_ALIASES } from "./types";
import type { TokensDocument } from "./types";

const pkgRoot = join(import.meta.dirname, "..");
const doc = JSON.parse(
  readFileSync(join(pkgRoot, "tokens.json"), "utf8"),
) as TokensDocument;

/* ---------------------------------------------------- brand value fidelity */

describe("brand fidelity", () => {
  it("never contradicts a colour value delivered in brand/", () => {
    // brand/courvia-tokens.json is the frozen delivered asset and stays the
    // authority on brand VALUES; this package owns the system STRUCTURE
    // (roles, schemes). Structure may grow; a value may never silently drift.
    const brand = JSON.parse(
      readFileSync(join(pkgRoot, "..", "..", "brand", "courvia-tokens.json"), "utf8"),
    ) as TokensDocument;

    const brandColors = flattenGroup(brand.global).filter(({ path }) => path.startsWith("color."));
    for (const { path, token } of brandColors) {
      const ours = flattenGroup(doc.global).find((t) => t.path === path);
      expect(ours, `brand primitive ${path} is missing`).toBeDefined();
      expect(ours?.token.$value, `brand primitive ${path} changed value`).toBe(token.$value);
    }
  });
});

/* -------------------------------------------------------- theme parity */

describe("theme parity", () => {
  for (const [alias, themeKey] of Object.entries(THEME_ALIASES)) {
    it(`${alias} defines every required semantic role`, () => {
      const group = doc.theme[themeKey];
      expect(group, `theme ${themeKey} missing`).toBeDefined();
      const paths = new Set(flattenGroup(group ?? {}).map(({ path }) => path));
      const missing = REQUIRED_ROLES.filter((role) => !paths.has(role));
      expect(missing, `${alias} is missing ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("keeps the required vocabulary closed", () => {
    // A role added here without being added to every theme is exactly the
    // bug this suite exists to prevent.
    expect(REQUIRED_ROLES).toHaveLength(COLOR_ROLES.length + FONT_ROLES.length + 1);
  });
});

/* --------------------------------------------------------------- contrast */

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function roleHex(themeKey: string, role: string): string {
  const group = doc.theme[themeKey];
  const found = flattenGroup(group ?? {}).find(({ path }) => path === `color.${role}`);
  if (found === undefined) throw new Error(`${themeKey} has no color.${role}`);
  return String(resolveToken(doc, found.token).$value);
}

describe("WCAG AA contrast", () => {
  for (const [alias, themeKey] of Object.entries(THEME_ALIASES)) {
    for (const pair of CONTRAST_PAIRS) {
      it(`${alias}: ${pair.label} clears AA`, () => {
        const ratio = contrastRatio(roleHex(themeKey, pair.text), roleHex(themeKey, pair.on));
        expect(
          ratio,
          `${alias} ${pair.text} on ${pair.on} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  }
});

/* --------------------------------------------- every var() resolves to a token */

/**
 * `.cv-feature-grid-item { padding: var(--cv-space-5) }` shipped, and the
 * scale has no step 5: the declaration was invalid at computed-value time,
 * padding fell back to the reset's 0 and the copy sat on the card border.
 * Nothing caught it. stylelint cannot — it has never read tokens.json — and
 * the previous version of this suite only looked at two of the repo's three
 * stylesheets, and `sections.css` was the one it did not look at.
 *
 * So the guard covers every stylesheet, and it asks two questions instead of
 * one: a name used WITHOUT a fallback must exist (or it computes to nothing),
 * and a name shaped like a token — `--cv-space-…`, `--cv-color-…` — must
 * exist even WITH a fallback, because that shape is a claim about the scale
 * and a fallback only hides the fact that the claim is false.
 */
describe("token variable usage", () => {
  /** Every stylesheet in the repo that consumes the token layer. */
  const CSS_SOURCES = [
    "packages/ui/src/styles.css",
    "packages/sections/src/sections.css",
    "apps/web/app/(frontend)/app.css",
  ];

  function read(file: string): string {
    return readFileSync(join(pkgRoot, "..", "..", file), "utf8");
  }

  const sources = new Map(CSS_SOURCES.map((file) => [file, read(file)]));

  /**
   * The appearance layer declares custom properties that are NOT tokens and
   * never will be (`--cv-section-measure`, `--cv-reveal-name`, `--cv-scrim`):
   * they carry an editor's enum choice from the wrapper down to the section.
   * Read as text rather than imported, because L0 may not depend on any
   * package in the repo — and reading the GENERATED sheet instead would make
   * this suite depend on a build having run.
   */
  const appearanceSource = read("packages/appearance/src/controls.ts");

  const tokenCss = buildCss(doc);
  const tokenNames = new Set([...tokenCss.matchAll(/(--cv-[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const declared = new Set(tokenNames);
  for (const text of [...sources.values(), appearanceSource]) {
    for (const match of text.matchAll(/(--cv-[A-Za-z0-9-]+)\s*:/g)) declared.add(match[1]);
  }

  /** First path segment of every token name: space, color, font, measure… */
  function group(name: string): string {
    return name.split("-")[3] ?? "";
  }

  const TOKEN_GROUPS = new Set([...tokenNames].map((name) => group(name ?? "")));

  /** Uses of `--cv-*`, split by whether a fallback softens a missing name. */
  function usages(text: string): { name: string; hasFallback: boolean }[] {
    return [...text.matchAll(/var\(\s*(--cv-[A-Za-z0-9-]+)\s*(,?)/g)].map((m) => ({
      name: m[1] ?? "",
      hasFallback: m[2] === ",",
    }));
  }

  for (const [file, text] of sources) {
    it(`${file}: nothing is read that nothing declares`, () => {
      const unknown = [
        ...new Set(usages(text).filter((u) => !u.hasFallback).map((u) => u.name)),
      ].filter((name) => !declared.has(name));
      expect(
        unknown,
        `${file} reads ${unknown.join(", ")} with no fallback and nothing declares it, ` +
          `so the whole declaration is dropped at computed-value time`,
      ).toEqual([]);
    });

    it(`${file}: nothing claims a step the scale does not have`, () => {
      const offScale = [...new Set(usages(text).map((u) => u.name))].filter(
        (name) => TOKEN_GROUPS.has(group(name)) && !tokenNames.has(name),
      );
      expect(offScale, `${file} references ${offScale.join(", ")}, absent from tokens.json`).toEqual(
        [],
      );
    });
  }
});

/**
 * Three rules in the app shell that the section layer depends on and cannot
 * enforce from its own package.
 *
 * A band deliberately has no width of its own — that is what lets a
 * background bleed to the glass — so whoever wraps it decides how far it
 * reaches. When `.page` capped every child at 1180px, no band could bleed
 * and every composed page read as one column floating in the same colour.
 * And with both the last band and the footer claiming the space between
 * them, composed pages carried 128px of dead background.
 *
 * The link rule is here for the same reason: the `link` role has had a
 * contrast test per theme since the beginning, and nothing read it, so every
 * anchor outside the nav fell back to the user agent's #0000EE — 1.74:1 on
 * surface. A token that no stylesheet consumes is a promise, not a colour.
 */
describe("the app shell keeps the promises the section layer relies on", () => {
  const app = readFileSync(join(pkgRoot, "..", "..", "apps/web/app/(frontend)/app.css"), "utf8");
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(app)?.[1] ?? "";
  };

  it("reads the rules it is asserting on", () => {
    // Without this, a selector rename would empty every body below and turn
    // the whole block green while saying nothing.
    expect(ruleBody(".page"), ".page not found").toContain("max-width");
  });

  it("a composed page does not cap the bands inside it", () => {
    expect(ruleBody(".page--composed")).toMatch(/max-width:\s*none/);
  });

  it("only the last band owns the space above the footer", () => {
    expect(ruleBody(".page--composed")).toMatch(/padding-block:\s*0/);
    expect(ruleBody(".site-footer")).not.toMatch(/margin-block-start/);
  });

  it("gives every anchor the link role instead of the user agent's blue", () => {
    expect(ruleBody("a")).toMatch(/color:\s*var\(--cv-color-link\)/);
  });
});
