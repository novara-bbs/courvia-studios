import { describe, expect, it } from "vitest";

import { buildAppearanceCss } from "./build-css";
import { CONTROLS, CONTROL_NAMES } from "./controls";
import type { ControlDefinition } from "./controls";
import { parseAppearance, resolveAppearance } from "./schema";

describe("failure semantics — the safety story", () => {
  it("unknown values fall back to the control default, never throw", () => {
    const parsed = parseAppearance({ background: "hotpink", width: "9999px" });
    expect(parsed.background).toBe("none");
    expect(parsed.width).toBe("content");
  });

  it("unknown keys are dropped, so stale content survives control removal", () => {
    const parsed = parseAppearance({ zIndex: "999", customCss: "body{}" });
    expect("zIndex" in parsed).toBe(false);
    expect("customCss" in parsed).toBe(false);
  });

  it("non-object input resolves to all defaults", () => {
    for (const input of [null, undefined, "x", 42]) {
      const parsed = parseAppearance(input);
      expect(parsed.spaceBlockStart).toBe("lg");
    }
  });
});

describe("resolveAppearance", () => {
  it("emits data attributes only for non-default values of allowed controls", () => {
    const attrs = resolveAppearance(
      { background: "inverse", align: "center", spaceBlockStart: "lg" },
      ["background", "align", "spaceBlockStart"],
    );
    expect(attrs).toEqual({ "data-bg": "inverse", "data-align": "center" });
  });

  it("ignores values for controls the section did not allow", () => {
    const attrs = resolveAppearance({ background: "accent" }, ["align"]);
    expect(attrs).toEqual({});
  });

  it("themeScope emits data-theme, enabling nested brand areas", () => {
    const attrs = resolveAppearance({ themeScope: "club" }, ["themeScope"]);
    expect(attrs).toEqual({ "data-theme": "club" });
  });
});

describe("CSS coverage — table and stylesheet cannot drift", () => {
  const css = buildAppearanceCss();

  it("every non-default enum value with declarations has a rule", () => {
    for (const name of CONTROL_NAMES) {
      const control: ControlDefinition = CONTROLS[name];
      if (control.css === null) continue;
      for (const value of control.values) {
        const declarations = control.css[value];
        if (declarations === undefined || declarations === "") continue;
        expect(css, `${name}=${value} missing from CSS`).toContain(
          `[${control.attribute}='${value}']`,
        );
      }
    }
  });

  it("contrast by construction: inverse and accent rebind the text roles", () => {
    expect(css).toMatch(/data-bg='inverse'[^}]*--cv-color-text: var\(--cv-color-text-inverse\)/);
    expect(css).toMatch(/data-bg='accent'[^}]*--cv-color-text: var\(--cv-color-accent-contrast\)/);
  });

  it("only logical properties", () => {
    expect(css).not.toMatch(/margin-left|padding-right|text-align: left/);
  });

  it("never emits a raw colour", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});
