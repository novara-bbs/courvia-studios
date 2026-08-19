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

describe("token variable usage", () => {
  const css = buildCss(doc);
  const declared = new Set([...css.matchAll(/(--cv-[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));

  function assertVarsExist(file: string): void {
    const source = readFileSync(join(pkgRoot, "..", "..", file), "utf8");
    const used = [...source.matchAll(/var\((--cv-[A-Za-z0-9-]+)/g)].map((m) => m[1]);
    const unknown = [...new Set(used)].filter((name) => name !== undefined && !declared.has(name));
    expect(unknown, `${file} references undeclared tokens: ${unknown.join(", ")}`).toEqual([]);
  }

  it("packages/ui styles only reference declared tokens", () => {
    assertVarsExist("packages/ui/src/styles.css");
  });

  it("apps/web styles only reference declared tokens", () => {
    assertVarsExist("apps/web/app/(frontend)/app.css");
  });
});
