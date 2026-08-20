/**
 * What robots.txt actually permits, resolved the way a crawler resolves it.
 *
 * This file had no test, and it cost the repo a real hole. Blocking `/api`
 * wholesale hid every product photograph from Googlebot-Image, because
 * Payload serves uploads under `/api/media/file/`. The fix went too far the
 * other way — `allow: ["/api/media/"]` with the `/api` block removed — and
 * opened Payload's entire REST API: `/api/pages?depth=2` is every published
 * page as JSON, `/api/globals/market-settings` lists the payment providers
 * each market offers, and `?page=`/`?limit=`/`?where[...]` make every
 * combination its own URL.
 *
 * Both mistakes pass a test that only reads the arrays. So this one resolves
 * paths the way RFC 9309 says a crawler does — longest matching rule wins,
 * Allow breaks a tie — and asserts on the answer.
 */
import { describe, expect, it } from "vitest";

import robots from "../../app/robots";

const rules = (() => {
  const group = robots().rules;
  const first = Array.isArray(group) ? group[0] : group;
  if (first === undefined) throw new Error("robots.txt declares no rule group");
  const list = (value: string | string[] | undefined): string[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  return { allow: list(first.allow), disallow: list(first.disallow) };
})();

/** RFC 9309 §2.2.2: most specific (longest) match wins; Allow breaks a tie. */
function crawlable(path: string): boolean {
  const longest = (patterns: string[]): number =>
    patterns.reduce((best, p) => (path.startsWith(p) && p.length > best ? p.length : best), -1);
  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);
  return allow >= disallow;
}

describe("robots.txt", () => {
  it("lets image crawlers reach an uploaded product photograph", () => {
    // The whole reason /api is not blocked outright.
    expect(crawlable("/api/media/file/tempo-r1-hero.webp")).toBe(true);
    expect(crawlable("/api/media/file/tempo-r1-hero-860x484.webp")).toBe(true);
  });

  it("keeps Payload's REST API out of the crawl", () => {
    for (const path of [
      "/api/media?limit=200",
      "/api/pages?depth=2",
      "/api/products",
      "/api/brands",
      "/api/categories",
      "/api/redirects",
      "/api/users",
      "/api/graphql",
      "/api/globals/navigation",
      "/api/globals/market-settings",
      "/api/globals/theme-settings",
    ]) {
      expect(crawlable(path), `${path} must not be crawlable`).toBe(false);
    }
  });

  it("keeps the admin and the preview entry points out", () => {
    expect(crawlable("/admin")).toBe(false);
    expect(crawlable("/admin/collections/orders")).toBe(false);
    expect(crawlable("/next/preview?path=%2Fes")).toBe(false);
  });

  it("leaves the storefront crawlable", () => {
    for (const path of ["/", "/es", "/es/robots/tempo-r1", "/es/c/robots", "/sitemap.xml"]) {
      expect(crawlable(path), `${path} must stay crawlable`).toBe(true);
    }
  });

  it("points at a sitemap on the canonical origin", () => {
    expect(robots().sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/);
  });
});
