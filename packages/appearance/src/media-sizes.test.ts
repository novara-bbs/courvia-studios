/**
 * `sizes` is the half of responsive images that fails silently: a wrong
 * value costs nothing visible, it just makes the browser fetch the wrong
 * candidate forever. So the arithmetic is asserted here rather than eyeballed
 * in a renderer.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseAppearance } from "./schema";
import { BREAKPOINTS, mediaSizes } from "./media-sizes";
import type { MediaFrame } from "./media-sizes";

function sizesFor(width: string, frame?: MediaFrame): string {
  return mediaSizes(parseAppearance({ width }), frame);
}

describe("the breakpoints cannot drift from the tokens", () => {
  it("matches global.breakpoint in tokens.json", () => {
    // A `sizes` media condition is parsed before any CSS applies, so it
    // cannot read --cv-breakpoint-*. The px literals are the copy, and this
    // is the test that keeps a copy honest.
    const raw = readFileSync(new URL("../../design-tokens/tokens.json", import.meta.url), "utf8");
    const tokens = JSON.parse(raw) as {
      global: { breakpoint: Record<string, { $value: string }> };
    };
    const fromTokens = Object.fromEntries(
      Object.entries(tokens.global.breakpoint).map(([name, token]) => [
        name,
        Number.parseInt(token.$value, 10),
      ]),
    );
    expect(fromTokens).toEqual({ ...BREAKPOINTS });
  });
});

describe("mediaSizes follows the measure the width control sets", () => {
  it("caps at the measure minus the wrapper padding", () => {
    expect(sizesFor("content")).toBe("(min-width: 1180px) 1132px, 100vw");
  });

  it("uses a narrower cap for prose", () => {
    expect(sizesFor("prose")).toBe("(min-width: 680px) 632px, 100vw");
  });

  it("never caps a full-width section", () => {
    expect(sizesFor("full")).toBe("100vw");
  });

  it("keeps the padding for media that bleeds past it", () => {
    // The stage's scene covers the wrapper's inline padding, so subtracting
    // it would under-fetch the one image that is the LCP.
    expect(sizesFor("content", { bleed: true })).toBe("(min-width: 1180px) 1180px, 100vw");
  });
});

describe("mediaSizes follows the columns control", () => {
  it("changes when the editor changes the column count", () => {
    const two = sizesFor("content", { columns: 2, from: "md" });
    const four = sizesFor("content", { columns: 4, from: "md" });
    expect(two).toBe("(min-width: 1180px) 566px, (min-width: 680px) 50vw, 100vw");
    expect(four).toBe("(min-width: 1180px) 283px, (min-width: 680px) 25vw, 100vw");
    expect(two).not.toBe(four);
  });

  it("divides only above the breakpoint where the grid appears", () => {
    // Below `lg` the media/text split is one column, so the image is the
    // full width of the viewport there.
    expect(sizesFor("content", { columns: 2, from: "lg" })).toBe(
      "(min-width: 1180px) 566px, (min-width: 860px) 50vw, 100vw",
    );
  });

  it("orders conditions widest first, since a browser takes the first match", () => {
    const parts = sizesFor("content", { columns: 3, from: "md" }).split(", ");
    const widths = parts
      .map((part) => /\(min-width: (\d+)px\)/.exec(part)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    expect(parts.at(-1)).toBe("100vw");
  });

  it("handles a grid whose breakpoint is wider than its measure", () => {
    // prose caps at 680 but the split appears at 860: between the two the
    // image still spans the whole 632px measure.
    expect(sizesFor("prose", { columns: 2, from: "lg" })).toBe(
      "(min-width: 860px) 316px, (min-width: 680px) 632px, 100vw",
    );
  });

  it("ignores a breakpoint when the image does not share its row", () => {
    expect(sizesFor("content", { columns: 1, from: "md" })).toBe(sizesFor("content"));
  });
});
