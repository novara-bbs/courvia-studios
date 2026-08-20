/**
 * A prepared region is declared NOWHERE.
 *
 * `ar-ae` shipped as a full region — statically generated, listed in the
 * sitemap, annotated `hreflang="ar-AE"` — while the only seeded content was
 * es/en, so every one of those URLs served the Spanish fallback under
 * `lang="ar"`. That is not a gap, it is a false statement: Search Console
 * reads it as a wrong language alternate, and because hreflang is evaluated
 * per CLUSTER the penalty reaches `en-ae`, which is a real market we intend
 * to sell in. It also contradicted ADR-09 outright.
 *
 * The fix is a `status` on the region definition, so publishing Arabic the
 * day the content exists is one value in `@courvia/platform` and nothing
 * else. These tests are what stops the literal from creeping back into the
 * four surfaces that used to spell the region list out: they iterate
 * PREPARED_REGIONS rather than naming `ar-ae`, so they keep working for
 * whatever the fifth region turns out to be.
 */
import { PREPARED_REGIONS, PUBLISHED_REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { regionAlternates, regionRobots } from "./region-alternates";

// The sitemap reads the catalog through the same cached loaders the routes
// use. Stubbed here so this file tests the region policy and nothing else —
// no database, no build-mode fallbacks, no coupling to what happens to be
// seeded today.
vi.mock("../catalog/get-catalog", () => ({
  listRobots: () => Promise.resolve([{ slug: "tempo-r1" }]),
}));
vi.mock("../catalog/get-category", () => ({
  listCategorySlugs: () => Promise.resolve(["padel"]),
}));
vi.mock("../content/get-page", () => ({
  // The sitemap asks for the INDEXABLE slugs, not every published one: a
  // page an editor marked noIndex stays live and stays out of here.
  listIndexableSlugs: () => Promise.resolve(["inicio", "privacidad"]),
  listPublishedSlugs: () => Promise.resolve(["inicio", "privacidad", "oculta"]),
}));

const preparedTags = PREPARED_REGIONS.map((r) => REGION_DEFINITIONS[r].hreflang);

describe("the sitemap", () => {
  it("has a prepared region to keep honest in the first place", () => {
    // If this ever fails because everything is published, delete it and the
    // ar-ae expectations below — do not weaken the rest of the file.
    expect(PREPARED_REGIONS.length).toBeGreaterThan(0);
  });

  it("lists no URL under a prepared region", async () => {
    const { default: sitemap } = await import("../../app/sitemap");
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const region of PREPARED_REGIONS) {
      expect(entries.filter((e) => new URL(e.url).pathname.startsWith(`/${region}`))).toEqual([]);
    }
  });

  it("still lists every published region, so this is a subtraction and not a mute", async () => {
    const { default: sitemap } = await import("../../app/sitemap");
    const entries = await sitemap();

    for (const region of PUBLISHED_REGIONS) {
      expect(entries.some((e) => new URL(e.url).pathname === `/${region}`)).toBe(true);
    }
  });

  it("annotates no prepared region in any alternate set", async () => {
    const { default: sitemap } = await import("../../app/sitemap");
    const entries = await sitemap();

    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      for (const tag of preparedTags) expect(languages).not.toHaveProperty(tag);
      for (const url of Object.values(languages)) {
        for (const region of PREPARED_REGIONS) {
          expect(new URL(String(url)).pathname.startsWith(`/${region}`)).toBe(false);
        }
      }
      // The cluster is a subtraction, not an emptying: every published
      // region is still annotated, x-default included.
      for (const region of PUBLISHED_REGIONS) {
        expect(languages).toHaveProperty(REGION_DEFINITIONS[region].hreflang);
      }
      expect(languages).toHaveProperty("x-default");
    }
  });
});

describe("regionAlternates", () => {
  it("never names a prepared region, from any page of any region", () => {
    for (const region of [...PUBLISHED_REGIONS, ...PREPARED_REGIONS]) {
      for (const path of ["", "/robots", "/robots/tempo-r1"]) {
        const languages = regionAlternates(region, path)?.languages ?? {};
        for (const tag of preparedTags) expect(languages).not.toHaveProperty(tag);
      }
    }
  });

  it("gives a published page the full cluster plus x-default", () => {
    const alternates = regionAlternates("es", "/robots");
    expect(alternates?.canonical).toBe("/es/robots");
    for (const region of PUBLISHED_REGIONS) {
      expect(alternates?.languages).toHaveProperty(
        REGION_DEFINITIONS[region].hreflang,
        `/${region}/robots`,
      );
    }
    expect(alternates?.languages).toHaveProperty("x-default", "/es/robots");
  });

  it("gives a prepared page a self canonical and no cluster at all", () => {
    // Not even outbound annotations: hreflang has to be reciprocal, and the
    // published pages no longer name this region, so a one-way annotation
    // is the "no return tags" error rather than a courtesy.
    for (const region of PREPARED_REGIONS) {
      const alternates = regionAlternates(region, "/robots");
      expect(alternates?.canonical).toBe(`/${region}/robots`);
      expect(alternates?.languages).toBeUndefined();
    }
  });
});

describe("regionRobots", () => {
  it("marks every page of a prepared region noindex", () => {
    for (const region of PREPARED_REGIONS) {
      expect(regionRobots(region)).toEqual({ index: false, follow: false });
    }
  });

  it("leaves published regions indexable — silence, not an `index: true`", () => {
    for (const region of PUBLISHED_REGIONS) {
      expect(regionRobots(region)).toBeUndefined();
    }
  });
});

describe("the public region selector", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("offers only published regions in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { VISIBLE_REGIONS } = await import("../chrome/region-selector");
    expect([...VISIBLE_REGIONS]).toEqual([...PUBLISHED_REGIONS]);
  });

  it("keeps prepared regions one click away while developing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { VISIBLE_REGIONS } = await import("../chrome/region-selector");
    for (const region of PREPARED_REGIONS) expect(VISIBLE_REGIONS).toContain(region);
  });
});
