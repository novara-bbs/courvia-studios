import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import type { Metadata } from "next";

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
  return {
    canonical: `/${region}${path}`,
    languages: {
      ...Object.fromEntries(
        Object.values(REGION_DEFINITIONS).map((r) => [r.hreflang, `/${r.id}${path}`]),
      ),
      "x-default": `/es${path}`,
    },
  };
}
