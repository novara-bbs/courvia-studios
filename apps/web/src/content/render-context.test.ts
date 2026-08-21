/**
 * The read-side barrier on stored destinations, and an honest measure of
 * what it is worth.
 *
 * `isAuthoredHref` runs as a Payload `validate` when an editor types a
 * destination. It says nothing about the values already in the database, and
 * it never runs for a write made with `overrideAccess` — a seed, a script, a
 * migration, an import. `resolveHref` is where those values are read, so it
 * is where the second barrier belongs.
 *
 * Two things this file deliberately does NOT claim:
 *
 *   1. That it closes a security hole. A `javascript:` destination is not
 *      script execution — React rewrites the attribute to
 *      `javascript:throw new Error('React has blocked a javascript: URL as a
 *      security precaution.')`. What is prevented here is a dead link and,
 *      worse, an unpredictable relative URL.
 *   2. That anything is broken today. The last case measures exactly that:
 *      every destination the content seed writes is already valid, so this
 *      is defence in depth and nothing more.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthoredHref } from "@courvia/sections/registry";
import type { RegionId } from "@courvia/platform";

import { makeRenderContext } from "./render-context";

/** The function under test, out of the context it is injected into. */
function resolve(href: string, region: RegionId = "es"): string {
  const ctx = makeRenderContext(false, region);
  // `resolveHref` is optional on RenderContext; a context without it would
  // make every assertion below vacuously true.
  expect(typeof ctx.resolveHref).toBe("function");
  return ctx.resolveHref!(href);
}

describe("a stored destination is judged again when it is read", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still resolves the region for the paths content is supposed to store", () => {
    expect(resolve("/robots")).toBe("/es/robots");
    expect(resolve("/robots", "en-gb")).toBe("/en-gb/robots");
    expect(resolve("/")).toBe("/es");
    // Legacy content with the region already baked in is left alone.
    expect(resolve("/es/robots")).toBe("/es/robots");
  });

  it("leaves the off-page and same-page forms untouched", () => {
    expect(resolve("#especificaciones")).toBe("#especificaciones");
    expect(resolve("https://courvia.com/x")).toBe("https://courvia.com/x");
    expect(resolve("mailto:hola@courvia.com")).toBe("mailto:hola@courvia.com");
    expect(resolve("tel:+34600000000")).toBe("tel:+34600000000");
  });

  it("degrades the missing slash instead of emitting a relative URL", () => {
    // The whole point: `robots/tempo-r1` used to pass through untouched and
    // then resolve against whatever page the visitor was on.
    expect(resolve("robots/tempo-r1")).toBe("#");
    expect(resolve("robots/tempo-r1", "en-gb")).toBe("#");
  });

  it("degrades the schemes an editor may not author, and says so on the server", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<b>x", "/robots /tempo", " /robots"]) {
      expect(resolve(href), href).toBe("#");
    }
    expect(console.warn).toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain("javascript:alert(1)");
  });

  it("says it once per page render, not once per link", () => {
    const ctx = makeRenderContext(false, "es");
    ctx.resolveHref!("robots/tempo-r1");
    ctx.resolveHref!("robots/tempo-r1");
    ctx.resolveHref!("robots/tempo-r1");
    expect(console.warn).toHaveBeenCalledTimes(1);
    // A different bad destination is a different mistake and is reported.
    ctx.resolveHref!("tempo/go");
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("has nothing to degrade in the content seed — this is defence in depth", () => {
    // Read as text rather than imported: seed-content.ts is a script with
    // top-level awaits that writes to the database on import.
    const source = readFileSync(
      fileURLToPath(new URL("../seeds/seed-content.ts", import.meta.url)),
      "utf8",
    );
    const stored = [...source.matchAll(/href:\s*"([^"]*)"/g)].map((match) => match[1]!);
    // Without this the assertion below would be a statement about the empty
    // list, and would pass forever after a rename of the field.
    expect(stored.length).toBeGreaterThan(30);
    expect(stored.filter((href) => !isAuthoredHref(href))).toEqual([]);
  });
});
