/**
 * Type and composition invariants over `sections.css`.
 *
 * This suite exists because three of the finish bugs in this stylesheet were
 * not typos, they were rules — a line-height meant for uppercase applied to
 * lower case, a reading measure derived from the band width, a chip role
 * spelled four ways. Each was fixed once and could be reintroduced by the
 * next section anyone adds, because nothing stated the rule. So the rules
 * are stated here, over the parsed sheet, not over the four declarations
 * that happen to break them today.
 *
 * What it cannot do: measure a rendered page. There is no browser in this
 * repo's test stack (Playwright arrives with WP16), so these assert the
 * cause — the declarations a browser would apply — and the report carries
 * the measured effects.
 */
import { SECTION_INNER_CLASS } from "@courvia/appearance";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "sections.css"), "utf8");

/**
 * The value of `--cv-measure-prose`, read from the token source rather than
 * copied here: the point of the token is that the number has one home, and a
 * test that hard-codes 62ch would keep passing after someone moved it.
 */
const PROSE_MEASURE = (
  JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "design-tokens", "tokens.json"), "utf8"),
  ) as { global: { measure: { prose: { $value: string } } } }
).global.measure.prose.$value;

interface Rule {
  selector: string;
  body: string;
}

/**
 * Leaf declaration blocks, with at-rules flattened away: a rule inside
 * `@media (min-width: 860px)` is still a rule about `.cv-media-text`, and
 * these invariants hold at every breakpoint.
 */
function parseRules(text: string): Rule[] {
  const out: Rule[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("{", index);
    if (open < 0) break;
    let depth = 1;
    let cursor = open + 1;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === "{") depth += 1;
      else if (text[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    const selector = text
      .slice(index, open)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    const body = text.slice(open + 1, cursor - 1);
    if (body.includes("{")) out.push(...parseRules(body));
    else out.push({ selector, body });
    index = cursor;
  }
  return out;
}

const RULES = parseRules(css);

function declaration(rule: Rule, property: string): string | undefined {
  const match = new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+)`).exec(rule.body);
  return match?.[1]?.trim();
}

describe("the sheet parses at all", () => {
  it("finds the rules it is about to make claims over", () => {
    // A parser that silently returns [] would make every test below pass.
    expect(RULES.length).toBeGreaterThan(100);
    expect(RULES.map((rule) => rule.selector)).toContain(".cv-prose");
  });
});

/* ------------------------------------------------------- the type scale */

const SIZE_ORDER = ["xs", "sm", "md", "lg", "xl", "2xl", "display"];

/** Rules that set the display face: whatever they are, they are headings. */
const DISPLAY_RULES = RULES.filter((rule) => rule.body.includes("--cv-font-display"));

describe("a heading is typeset as a heading", () => {
  it("finds the headings", () => {
    expect(DISPLAY_RULES.length).toBeGreaterThan(15);
  });

  it("never renders at body size or smaller", () => {
    // The card titles used to be `md` — 16px, the same as the page body and
    // LARGER than their own 14px copy, so nothing about them read as a title.
    const floor = SIZE_ORDER.indexOf("lg");
    const undersized = DISPLAY_RULES.filter((rule) => {
      const size = /--cv-font-size-([a-z0-9]+)\)/.exec(declaration(rule, "font-size") ?? "")?.[1];
      return size === undefined || SIZE_ORDER.indexOf(size) < floor;
    }).map((rule) => rule.selector);
    expect(undersized, `${undersized.join(", ")} set the display face at body size`).toEqual([]);
  });

  it("always states its own line-height instead of inheriting 1.6", () => {
    const inheriting = DISPLAY_RULES.filter(
      (rule) => declaration(rule, "line-height") === undefined,
    ).map((rule) => rule.selector);
    expect(inheriting, `${inheriting.join(", ")} would fall to the body's 1.6`).toEqual([]);
  });
});

describe("1.0 line-height is for uppercase only", () => {
  /**
   * `tight` is 1.0. Uppercase has no descenders, so a 1.0 box still clears
   * the glyphs; lower case does not, and the pull quote rendered at
   * 20px/20px with its descenders touching the next line's ascenders.
   * `.cv-stat-value` keeps it as the single documented exception: it is one
   * tabular figure per cell, and opening it would push the number grid apart.
   */
  const SINGLE_LINE_EXCEPTIONS = [".cv-stat-value"];

  it("is not used on a lower-case setting", () => {
    const offenders = RULES.filter((rule) => rule.body.includes("--cv-font-lineHeight-tight"))
      .filter((rule) => !rule.body.includes("text-transform: uppercase"))
      .map((rule) => rule.selector)
      .filter((selector) => !SINGLE_LINE_EXCEPTIONS.includes(selector));
    expect(offenders, `${offenders.join(", ")} clip their descenders at 1.0`).toEqual([]);
  });

  it("keeps the exception list honest", () => {
    // An exception for a rule that no longer exists is a licence nobody
    // revoked; the next `tight` to appear there would inherit the excuse.
    const selectors = RULES.map((rule) => rule.selector);
    for (const exception of SINGLE_LINE_EXCEPTIONS) expect(selectors).toContain(exception);
  });

  it("leaves snug doing real work", () => {
    // The whole reason this bug survived: 1.25 was defined and used nowhere,
    // so every heading was choosing between 1.0 and 1.6.
    expect(css.match(/--cv-font-lineHeight-snug/g)?.length ?? 0).toBeGreaterThan(10);
  });
});

/* --------------------------------------------------- the reading measure */

describe("the reading measure is not a share of the band", () => {
  it("no section reads --cv-section-measure", () => {
    // That variable is `none` under `width: full`, so anything capping text
    // with it loses its cap on exactly the sections that are widest. The
    // band's measure belongs to the band's container and to nothing else.
    const readers = RULES.filter((rule) => rule.body.includes("--cv-section-measure")).map(
      (rule) => rule.selector,
    );
    expect(readers).toEqual([]);
  });

  it("running prose is capped by the token, in ch", () => {
    const prose = RULES.find((rule) => rule.selector === ".cv-prose");
    expect(declaration(prose ?? { selector: "", body: "" }, "max-inline-size")).toBe(
      "var(--cv-measure-prose)",
    );
  });

  it("nothing re-spells the constant by hand", () => {
    // Seven hand-written `62ch` were the reason the constant could drift in
    // six places and stay right in the seventh. Narrower local measures
    // (28ch for a stage headline, 48ch for a form panel) are deliberate
    // composition and stay literal; what may not be literal is the shared
    // one, because that is the one meant to move together.
    expect(css, `the sheet writes ${PROSE_MEASURE} instead of --cv-measure-prose`).not.toContain(
      `: ${PROSE_MEASURE}`,
    );
  });
});

/* --------------------------------------------------- the telemetry chip */

describe("letter-spacing is a token, not a taste", () => {
  it("no rule writes an em value by hand", () => {
    const offenders = RULES.filter((rule) => {
      const value = declaration(rule, "letter-spacing");
      return value !== undefined && !value.includes("--cv-font-tracking-");
    }).map((rule) => rule.selector);
    expect(offenders, `${offenders.join(", ")} hand-write a tracking value`).toEqual([]);
  });

  it("the uppercase 12px chip role is one value everywhere", () => {
    const chips = RULES.filter(
      (rule) =>
        rule.body.includes("--cv-font-size-xs") && rule.body.includes("text-transform: uppercase"),
    );
    expect(chips.length).toBeGreaterThan(4);
    const values = new Set(chips.map((rule) => declaration(rule, "letter-spacing")));
    expect(values, "the same chip rendered at several trackings").toEqual(
      new Set(["var(--cv-font-tracking-wider)"]),
    );
  });
});

/* ---------------------------------------------------- entrance animation */

describe("the entrance moves the content, not the paint", () => {
  const band = RULES.filter((rule) => rule.selector === "[data-reveal]");
  const inner = RULES.filter(
    (rule) => rule.selector === `[data-reveal] > .${SECTION_INNER_CLASS}`,
  );

  it("animates the container", () => {
    expect(inner).toHaveLength(1);
    expect(declaration(inner[0] ?? { selector: "", body: "" }, "animation")).toBe(
      "var(--cv-reveal-name) linear both",
    );
  });

  it("never animates the element that paints the background", () => {
    // The band carries `background`, `border-block-start` (divider) and the
    // block rhythm. Transforming it slid a whole band down 24px, opening a
    // seam of page background between two adjacent surfaces and hiding a
    // hairline under the band above it, until the reveal finished.
    for (const rule of band) {
      expect(declaration(rule, "animation")).toBeUndefined();
      expect(declaration(rule, "transform")).toBeUndefined();
    }
  });

  it("still takes its timeline from the band, so the choreography is unchanged", () => {
    // `view()` on the container would measure the container's box, which
    // excludes the section's padding-block and shifts every keyframe.
    const named = declaration(band[0] ?? { selector: "", body: "" }, "view-timeline");
    expect(named).toBeDefined();
    const timelineName = named?.split(/\s+/)[0];
    expect(declaration(inner[0] ?? { selector: "", body: "" }, "animation-timeline")).toBe(
      timelineName,
    );
  });

  it("keeps the keyframes transform-only", () => {
    // ADR-023: a stalled scroll timeline must never be able to hide content.
    const keyframes = /@keyframes cv-reveal-[a-z]+\s*\{[\s\S]*?\n\}/g;
    for (const block of css.match(keyframes) ?? []) {
      expect(block).not.toMatch(/opacity|visibility|display/);
    }
  });
});

/* ----------------------------------------------- the band keeps its copy */

describe("a bleeding band still gives its copy a column", () => {
  it("the stage lays its body out in a centred track capped at the page measure", () => {
    // Under `width: full` the container has no measure, so without this the
    // headline starts 24px from the edge of a 2560px screen.
    const stage = RULES.find((rule) => rule.selector === ".cv-stage");
    expect(declaration(stage ?? { selector: "", body: "" }, "grid-template-columns")).toBe(
      "min(100%, var(--cv-breakpoint-xl))",
    );
    expect(declaration(stage ?? { selector: "", body: "" }, "justify-content")).toBe("center");
  });

  it("the media still escapes the container's inline padding", () => {
    const media = RULES.find((rule) => rule.selector === ".cv-stage-media");
    expect(declaration(media ?? { selector: "", body: "" }, "inset-inline")).toBe(
      "calc(var(--cv-space-6) * -1)",
    );
  });
});

/* ------------------------------------------- the image sets no band height */

describe("the band height is not decided by the uploaded file", () => {
  it("media and text start together instead of centring on the taller one", () => {
    const mediaText = RULES.find((rule) => rule.selector === ".cv-media-text");
    expect(declaration(mediaText ?? { selector: "", body: "" }, "align-items")).toBe("start");
  });
});
