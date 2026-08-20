/**
 * The three facts `proxy.ts` repeats instead of importing, and the parsing
 * that stands between a broken endpoint and every route in the app.
 *
 * The proxy is the one file that must not grow deep framework imports (it is
 * bundled separately and runs ahead of everything), so it hard-codes Next's
 * draft-mode cookie name. This file reads the framework's own constant and
 * fails if the two ever drift — the same shape as
 * `security-headers.test.ts`, which reads the embed section's provider table
 * rather than trusting a copy of it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COOKIE_NAME_PRERENDER_BYPASS } from "next/dist/server/api-utils";
import { describe, expect, it } from "vitest";

import { ROUTING_MANIFEST_PATH } from "./region-routes";
import { parseManifest } from "./manifest-client";

const PROXY_SOURCE = readFileSync(
  fileURLToPath(new URL("../../proxy.ts", import.meta.url)),
  "utf8",
);

describe("proxy.ts", () => {
  it("names the draft cookie Next actually sets", () => {
    // If this drifts, preview silently breaks: an unpublished page is not in
    // the manifest, so the editor's own site would tell them it is a 404.
    const declared = /const DRAFT_COOKIE = "([^"]+)"/.exec(PROXY_SOURCE)?.[1];
    expect(declared).toBe(COOKIE_NAME_PRERENDER_BYPASS);
  });

  it("excludes from its matcher the very path it fetches", () => {
    // The manifest lives under /next/; if the matcher stopped skipping that
    // prefix, the proxy's own lookup would be intercepted by the proxy.
    expect(ROUTING_MANIFEST_PATH.startsWith("/next/")).toBe(true);
    expect(PROXY_SOURCE).toContain("next(?:/|$)");
  });

  it("rewrites rather than answering the 404 itself", () => {
    // A rewrite's status is discarded (measured); the destination has to be
    // a route that already answers 404. If this ever becomes a direct
    // Response, the branded body goes with it.
    expect(PROXY_SOURCE).toContain("NextResponse.rewrite");
  });
});

describe("parseManifest", () => {
  const full = {
    pages: ["privacidad"],
    products: ["tempo-r1"],
    categories: ["robots"],
    redirects: [{ from: "/vieja", to: "/nueva", code: "302" }],
  };

  it("accepts a well-formed manifest and normalizes its paths", () => {
    expect(parseManifest({ ...full, redirects: [{ from: "Vieja/", to: "/Nueva", code: "302" }] }))
      .toEqual({ ...full, redirects: [{ from: "/vieja", to: "/nueva", code: "302" }] });
  });

  it("defaults an unknown redirect code to permanent", () => {
    const parsed = parseManifest({ ...full, redirects: [{ from: "/a", to: "/b", code: "418" }] });
    expect(parsed?.redirects[0]?.code).toBe("301");
  });

  it("drops rows that are not redirects at all", () => {
    const parsed = parseManifest({ ...full, redirects: [{ from: 7 }, null, "nope"] });
    expect(parsed?.redirects).toEqual([]);
  });

  it("refuses garbage instead of throwing inside the proxy", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest("nope")).toBeNull();
    expect(parseManifest({ pages: "privacidad" })).toBeNull();
  });

  it("refuses a manifest that knows about nothing", () => {
    // Indistinguishable from a build with no database. Believing it would
    // 404 every URL on the site; disbelieving it costs one soft 404 on a
    // genuinely empty CMS.
    expect(parseManifest({ pages: [], products: [], categories: [], redirects: [] })).toBeNull();
  });
});
