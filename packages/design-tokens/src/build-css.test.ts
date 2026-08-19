import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCss,
  cssValue,
  cssVarName,
  lookupToken,
  resolveToken,
  themeValueCss,
} from "./build-css";
import { THEME_ALIASES } from "./types";
import type { Token, TokensDocument } from "./types";

const pkgRoot = join(import.meta.dirname, "..");
const doc = JSON.parse(
  readFileSync(join(pkgRoot, "tokens.json"), "utf8"),
) as TokensDocument;

describe("tokens.json", () => {
  // Value fidelity against brand/ is asserted in semantic-contract.test.ts;
  // this file covers the compiler.
  it("contains the three canonical themes for the three aliases", () => {
    for (const themeKey of Object.values(THEME_ALIASES)) {
      expect(doc.theme[themeKey]).toBeDefined();
    }
  });
});

describe("cssVarName", () => {
  it("maps dot paths to --cv- variables", () => {
    expect(cssVarName("color.court.950")).toBe("--cv-color-court-950");
    expect(cssVarName("font.size.2xl")).toBe("--cv-font-size-2xl");
  });
});

describe("resolveToken / lookupToken", () => {
  it("resolves a global reference to its literal", () => {
    const token = lookupToken(doc, "theme.volt-precision.color.bg");
    const resolved = resolveToken(doc, token);
    expect(resolved.$value).toBe("#081426"); // global.color.court.950
  });

  it("throws on unknown references", () => {
    const bad: Token = { $type: "color", $value: "{global.color.nope.1}" };
    expect(() => resolveToken(doc, bad)).toThrow(/not found/);
  });

  it("throws on over-long references that walk past a token", () => {
    const overlong: Token = { $type: "color", $value: "{global.color.volt.400.oops}" };
    expect(() => resolveToken(doc, overlong)).toThrow(/not found/);
  });

  it("detects circular references", () => {
    const cyclic: TokensDocument = {
      global: {
        a: { $type: "color", $value: "{global.b}" },
        b: { $type: "color", $value: "{global.a}" },
      },
      theme: {},
    };
    const a = lookupToken(cyclic, "global.a");
    expect(() => resolveToken(cyclic, a)).toThrow(/Circular/);
  });
});

describe("cssValue", () => {
  it("formats fontFamily quoting non-generic names only", () => {
    expect(
      cssValue({ $type: "fontFamily", $value: ["IBM Plex Mono", "monospace"] }),
    ).toBe("'IBM Plex Mono', monospace");
  });

  it("formats cubicBezier and shadow", () => {
    expect(cssValue({ $type: "cubicBezier", $value: [0.2, 0, 0, 1] })).toBe(
      "cubic-bezier(0.2, 0, 0, 1)",
    );
    expect(
      cssValue({
        $type: "shadow",
        $value: {
          color: "#0C132226",
          offsetX: "0px",
          offsetY: "6px",
          blur: "20px",
          spread: "0px",
        },
      }),
    ).toBe("0px 6px 20px 0px #0C132226");
  });

  it("rejects unknown $type instead of emitting 'undefined'", () => {
    const alien = { $type: "gradient", $value: "x" } as unknown as Token;
    expect(() => cssValue(alien)).toThrow(/Unsupported token \$type/);
  });

  it("rejects references embedded in composite values", () => {
    expect(() =>
      cssValue({ $type: "fontFamily", $value: ["{global.font.x}", "serif"] }),
    ).toThrow(/composite/);
    expect(() =>
      cssValue({
        $type: "shadow",
        $value: {
          color: "{global.color.ink.900}",
          offsetX: "0px",
          offsetY: "1px",
          blur: "2px",
          spread: "0px",
        },
      }),
    ).toThrow(/composite/);
  });
});

describe("themeValueCss", () => {
  it("keeps global references as var() indirections", () => {
    const accent = lookupToken(doc, "theme.volt-precision.color.accent");
    expect(themeValueCss(doc, accent)).toBe("var(--cv-color-volt-400)");
  });

  it("emits literals as-is", () => {
    const surface = lookupToken(doc, "theme.volt-precision.color.surface");
    expect(themeValueCss(doc, surface)).toBe("#0E2038");
  });
});

describe("buildCss", () => {
  const css = buildCss(doc);

  it("emits primitives on :root", () => {
    expect(css).toContain("--cv-color-volt-400: #D8F343;");
    expect(css).toContain("--cv-space-1: 4px;");
    expect(css).toContain("--cv-breakpoint-xl: 1180px;");
  });

  it("applies volt to bare :root as dark-first default", () => {
    expect(css).toContain(":root,\n[data-theme='volt']");
  });

  it("emits one block per short theme alias with expected accents", () => {
    expect(css).toContain("[data-theme='carbon']");
    expect(css).toContain("[data-theme='club']");
    // carbon accent -> drive.600, club accent -> clay.600 (via var refs)
    expect(css).toMatch(/\[data-theme='carbon'\][^}]*var\(--cv-color-drive-600\)/s);
    expect(css).toMatch(/\[data-theme='club'\][^}]*var\(--cv-color-clay-600\)/s);
  });

  it("never emits an unresolved reference", () => {
    expect(css).not.toContain("{global.");
  });

  it("neutralizes theme-specific extras so they never leak across themes", () => {
    // Required roles are now defined by every theme (semantic contract), so
    // only theme-specific flourishes need neutralizing. Without this, club's
    // trophy gold would bleed into volt through the bare :root block.
    const voltBlock = /:root,\n\[data-theme='volt'\] \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(voltBlock).toContain("--cv-color-highlight: initial;");
    expect(voltBlock).toContain("--cv-color-surface-brand: initial;");
    expect(voltBlock).toContain("--cv-font-voice: initial;");

    const carbonBlock = /\[data-theme='carbon'\] \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(carbonBlock).toContain("--cv-color-highlight: initial;");
  });

  it("defines every required semantic role in every theme block", () => {
    for (const alias of ["volt", "carbon", "club"]) {
      const pattern =
        alias === "volt"
          ? /:root,\n\[data-theme='volt'\] \{([^}]*)\}/s
          : new RegExp(`\\[data-theme='${alias}'\\] \\{([^}]*)\\}`, "s");
      const block = pattern.exec(css)?.[1] ?? "";
      for (const role of ["bg", "surface", "surface-inverse", "text", "link", "border"]) {
        expect(block, `${alias} missing ${role}`).toContain(`--cv-color-${role}:`);
        expect(block).not.toContain(`--cv-color-${role}: initial;`);
      }
    }
  });
});
