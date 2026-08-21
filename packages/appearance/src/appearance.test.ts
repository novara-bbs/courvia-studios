import { describe, expect, it } from "vitest";

import { buildAppearanceCss } from "./build-css";
import { CONTROLS, CONTROL_NAMES, SECTION_INNER_CLASS } from "./controls";
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

  // The controls added for the landing vocabulary. Each is asserted on its
  // own attribute name because the attribute — not the control name — is
  // what the stylesheet and the rendered page agree on: rename one without
  // the other and the control silently does nothing.
  it("carries the composition controls onto their own attributes", () => {
    expect(
      resolveAppearance({ height: "tall", overlay: "gradient" }, ["height", "overlay"]),
    ).toEqual({ "data-height": "tall", "data-overlay": "gradient" });
    expect(resolveAppearance({ reveal: "rise" }, ["reveal"])).toEqual({ "data-reveal": "rise" });
    expect(resolveAppearance({ divider: "hairline" }, ["divider"])).toEqual({
      "data-divider": "hairline",
    });
    expect(resolveAppearance({ hiddenOn: "mobile" }, ["hiddenOn"])).toEqual({
      "data-hidden-on": "mobile",
    });
  });

  it("stays silent on the default of every control", () => {
    // Emitting `data-x="<default>"` would work but doubles the attribute
    // noise on every section and makes a diff of rendered HTML unreadable.
    for (const name of CONTROL_NAMES) {
      const control: ControlDefinition = CONTROLS[name];
      expect(resolveAppearance({ [name]: control.default }, [name]), `${name}`).toEqual({});
    }
  });

  it("every control has a distinct attribute", () => {
    const attributes = CONTROL_NAMES.map((name) => CONTROLS[name].attribute);
    expect(new Set(attributes).size).toBe(attributes.length);
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

  it("has no rule for a value the table no longer offers", () => {
    // The reverse of the coverage test above: a control value that gets
    // renamed leaves its old rule behind, and the stale rule keeps working
    // for content nobody can produce any more — a slow, silent divergence.
    for (const name of CONTROL_NAMES) {
      const control: ControlDefinition = CONTROLS[name];
      if (control.css === null) continue;
      const selectors = [...css.matchAll(new RegExp(`\\[${control.attribute}='([^']+)'\\]`, "g"))];
      for (const [, value] of selectors) {
        expect(control.values, `${name}: stale rule for '${value}'`).toContain(value);
      }
    }
  });
});

/**
 * A band that carries its own measure is not a band: it is a rectangle. The
 * whole point of the split is that the painting element has NO inline size
 * of its own, so `background: surface` runs as far as the page lets it and
 * only the column inside stops at the measure. Asserted as an invariant over
 * the generated sheet rather than as a spot check on today's declarations:
 * any future control that puts an inline constraint back on the band fails
 * here, which is how the property stays true after this session.
 */
describe("band and container are two elements", () => {
  const css = buildAppearanceCss();

  /** Leaf rules of the generated sheet: it has no nesting and no at-rules. */
  const rules = [...css.matchAll(/([^{}\n]+)\{([^}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));

  /** Everything that can stop an element from being as wide as its parent. */
  const INLINE_CONSTRAINTS = ["max-inline-size", "inline-size", "margin-inline", "padding-inline"];

  const innerSelector = `[data-cv-section] > .${SECTION_INNER_CLASS}`;

  it("emits a rule for the inner container, not just a class name in a comment", () => {
    expect(rules.map((rule) => rule.selector)).toContain(innerSelector);
  });

  it("no rule constrains the inline size of the band", () => {
    const offenders = rules
      .filter((rule) => !rule.selector.includes(SECTION_INNER_CLASS))
      .filter((rule) => INLINE_CONSTRAINTS.some((property) => rule.body.includes(`${property}:`)))
      .map((rule) => rule.selector);
    expect(
      offenders,
      `${offenders.join(", ")} would cap the element that paints the background, ` +
        `so a full-width background could never reach the edge`,
    ).toEqual([]);
  });

  it("the container is what carries the measure and the inline padding", () => {
    const inner = rules.find((rule) => rule.selector === innerSelector);
    expect(inner?.body).toContain("max-inline-size: var(--cv-section-measure");
    expect(inner?.body).toContain("padding-inline: var(--cv-space-6)");
    expect(inner?.body).toContain("margin-inline: auto");
  });

  it("only the container ever reads the measure", () => {
    // --cv-section-measure may be `none` (width: full). Anything else that
    // read it would silently lose its cap on a full-bleed section — which is
    // exactly how running prose ended up 144 characters wide.
    const readers = rules
      .filter((rule) => rule.body.includes("var(--cv-section-measure"))
      .map((rule) => rule.selector);
    expect(readers).toEqual([innerSelector]);
  });

  it("the band still resolves the colour role it rebinds", () => {
    // Moving `color` to the inner would freeze it before data-bg=inverse
    // had a chance to rebind --cv-color-text on the band.
    const band = rules.find((rule) => rule.selector === "[data-cv-section]");
    expect(band?.body).toContain("color: var(--cv-color-text)");
  });
});
