import { REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { MetadataRoute } from "next";

import { listRobots } from "../src/catalog/get-catalog";
import { listCategorySlugs } from "../src/catalog/get-category";
import { listPublishedSlugs } from "../src/content/get-page";
import { siteUrl } from "../src/seo/site-url";

/** The hreflang alternate set for one path, shared by every entry. */
function alternatesFor(path: string): { languages: Record<string, string> } {
  return {
    languages: {
      ...Object.fromEntries(
        Object.values(REGION_DEFINITIONS).map((r) => [r.hreflang, `${siteUrl()}/${r.id}${path}`]),
      ),
      "x-default": `${siteUrl()}/es${path}`,
    },
  };
}

function entry(
  region: string,
  path: string,
  changeFrequency: "weekly" | "monthly",
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${siteUrl()}/${region}${path}`,
    changeFrequency,
    priority,
    alternates: alternatesFor(path),
  };
}

/**
 * Every indexable route per region: home, catalog, comparator, PDPs and
 * published CMS pages, each carrying the full hreflang alternate set. The
 * catalog/page reads are the same cached loaders the routes use (tags
 * "catalog"/"pages"), and they resolve empty in a DB-less build — the
 * sitemap then still lists the static routes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Slugs are shared across regions; ES is the base market and sees the
  // whole published catalog (unsold-here products still render their PDP).
  // listRobots keeps its own policy: empty in a DB-less build, throw when a
  // configured DB fails (never bake an empty catalog into a max-life cache).
  const [products, pageSlugs, categorySlugs] = await Promise.all([
    listRobots("es"),
    listPublishedSlugs(),
    listCategorySlugs(),
  ]);

  return REGIONS.flatMap((region) => [
    entry(region, "", "weekly", region === "es" ? 1 : 0.8),
    entry(region, "/robots", "weekly", 0.9),
    entry(region, "/comparar", "weekly", 0.7),
    ...products.map((product) => entry(region, `/robots/${product.slug}`, "weekly", 0.9)),
    ...categorySlugs.map((slug) => entry(region, `/c/${slug}`, "weekly", 0.6)),
    // "inicio" IS the region home — already listed as the root entry.
    ...pageSlugs
      .filter((slug) => slug !== "inicio")
      .map((slug) => entry(region, `/${slug}`, "monthly", 0.4)),
  ]);
}
