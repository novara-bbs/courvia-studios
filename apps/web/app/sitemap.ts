import { REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { MetadataRoute } from "next";

import { siteUrl } from "../src/seo/site-url";

/**
 * One entry per region route, each carrying the full hreflang alternate set.
 * Product and page URLs join this from the CMS when the catalog lands.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    Object.values(REGION_DEFINITIONS).map((r) => [r.hreflang, `${siteUrl()}/${r.id}`]),
  );

  return REGIONS.map((region) => ({
    url: `${siteUrl()}/${region}`,
    changeFrequency: "weekly",
    priority: region === "es" ? 1 : 0.8,
    alternates: { languages: { ...languages, "x-default": `${siteUrl()}/es` } },
  }));
}
