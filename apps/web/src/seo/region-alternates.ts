import {
  DEFAULT_REGION,
  PUBLISHED_REGIONS,
  REGION_DEFINITIONS,
  isPublishedRegion,
} from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import type { Metadata } from "next";

/**
 * What one page tells a search engine about its region: its canonical, its
 * hreflang cluster and whether it may be indexed at all.
 *
 * The cluster is built from PUBLISHED_REGIONS, never from REGIONS. A
 * prepared region (`@courvia/platform`) has a route and a layout but no
 * content in its language, so annotating it as the `ar-AE` alternate of a
 * page whose body is Spanish is not a small inaccuracy: Search Console reads
 * the whole cluster as a wrong language alternate and the damage lands on
 * en-ae too, which is real.
 */

/**
 * Canonical + hreflang for one page, called from EACH page's
 * generateMetadata — never from a layout. Next.js merges metadata per key,
 * so alternates defined in a layout are inherited verbatim by every nested
 * route: each deep page would silently declare the region HOME as its
 * canonical and search engines would deindex the content in favour of it.
 *
 * @param path Path below the region, starting with "/" ("" for the home).
 */
export function regionAlternates(region: RegionId, path: string): Metadata["alternates"] {
  const canonical = `/${region}${path}`;

  // A prepared region publishes no annotations at all — not even pointing
  // OUT to the published ones. hreflang is reciprocal by design: the
  // published pages do not name this region, so an outbound-only annotation
  // is precisely the "no return tags" error we are here to avoid.
  if (!isPublishedRegion(region)) return { canonical };

  return {
    canonical,
    languages: {
      ...Object.fromEntries(
        PUBLISHED_REGIONS.map((r) => [REGION_DEFINITIONS[r].hreflang, `/${r}${path}`]),
      ),
      // x-default lands on the default region, which the platform test
      // keeps published: a noindex x-default would break the whole cluster.
      "x-default": `/${DEFAULT_REGION}${path}`,
    },
  };
}

/**
 * Indexing policy for a whole region, spread into the region LAYOUT's
 * metadata — the one key where inheritance is what we want, because this is
 * a property of the region and not of the page. A page that needs its own
 * rule (`/gracias`) still overrides it.
 *
 * Deliberately NOT a robots.txt `Disallow`: a disallowed URL is never
 * fetched, so the `noindex` below would never be read, and a URL that
 * accumulated links could stay indexed with no description at all. The page
 * must be crawlable in order to be told to go away.
 */
export function regionRobots(region: RegionId): Metadata["robots"] {
  if (isPublishedRegion(region)) return undefined;
  return { index: false, follow: false };
}
