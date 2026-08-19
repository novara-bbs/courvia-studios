import { REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * One entry per region route, each carrying the full hreflang alternate set.
 * Product and page URLs join this from the CMS when the catalog lands.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    Object.values(REGION_DEFINITIONS).map((r) => [r.hreflang, `${SITE_URL}/${r.id}`]),
  );

  return REGIONS.map((region) => ({
    url: `${SITE_URL}/${region}`,
    changeFrequency: "weekly",
    priority: region === "es" ? 1 : 0.8,
    alternates: { languages: { ...languages, "x-default": `${SITE_URL}/es` } },
  }));
}
