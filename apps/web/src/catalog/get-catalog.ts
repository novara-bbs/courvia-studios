/**
 * Cached, market-aware catalog reads. Routes call these, never the port
 * directly, so every page shares one tagging scheme:
 *
 *   "catalog"        — any product/variant/price/inventory change
 *   "product:{slug}" — one PDP
 *
 * The catalog collections' afterChange hooks revalidate those tags.
 */
import type { ProductDetail, ProductSummary } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS, type RegionId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";

import { getCommerce } from "../server/container";

/**
 * Whether an error at build time should be swallowed (returning empty) or
 * rethrown to fail the build. A DB-less build (local, or a CI job with no
 * database) is intentional — the pages render on demand at runtime — so
 * empty is correct. But if a database IS configured and the query still
 * fails, that is a real fault: failing the build is far better than baking
 * an empty catalog into a max-life cache for up to a year.
 */
function swallowAtBuild(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" &&
    (process.env.DATABASE_URL ?? "") === ""
  );
}

export async function listRobots(region: RegionId): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market });
  } catch (error) {
    console.error(`catalog listing failed for region "${region}"`, error);
    if (swallowAtBuild()) return [];
    throw error;
  }
}

/** The listing of one category (dynamic category pages). */
export async function listRobotsInCategory(
  categoryId: string,
  region: RegionId,
): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market, category: categoryId });
  } catch (error) {
    console.error(`category listing failed for "${categoryId}"`, error);
    if (swallowAtBuild()) return [];
    throw error;
  }
}

/** Summaries for an explicit slug list (CMS product blocks), in the order
 *  the editor picked. Same tag as the listing: prices stay live. */
export async function listRobotsBySlugs(
  slugs: string[],
  region: RegionId,
): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  if (slugs.length === 0) return [];
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    const summaries = await commerce.listProducts({ market, slugs });
    const bySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
    return slugs.flatMap((slug) => {
      const summary = bySlug.get(slug);
      return summary === undefined ? [] : [summary];
    });
  } catch (error) {
    console.error(`product-block listing failed`, error);
    if (swallowAtBuild()) return [];
    throw error;
  }
}

export async function getRobot(slug: string, region: RegionId): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog", `product:${slug}`);
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.getProductDetail(slug, market);
  } catch (error) {
    console.error(`product read failed for "${slug}"`, error);
    if (swallowAtBuild()) return null;
    throw error;
  }
}
