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

import { isDatabaselessBuild } from "../server/build-env";
import { getCommerce } from "../server/container";

export async function listRobots(region: RegionId): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog", "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market });
  } catch (error) {
    console.error(`catalog listing failed for region "${region}"`, error);
    if (isDatabaselessBuild(`the "${region}" robot listing`, error)) return [];
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
  cacheTag("catalog", "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market, category: categoryId });
  } catch (error) {
    console.error(`category listing failed for "${categoryId}"`, error);
    if (isDatabaselessBuild(`the listing of category "${categoryId}"`, error)) return [];
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
  cacheTag("catalog", "media");
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
    if (isDatabaselessBuild(`a product block with ${String(slugs.length)} slug(s)`, error)) return [];
    throw error;
  }
}

export async function getRobot(slug: string, region: RegionId): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog", `product:${slug}`, "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.getProductDetail(slug, market);
  } catch (error) {
    console.error(`product read failed for "${slug}"`, error);
    if (isDatabaselessBuild(`the "${slug}" product page`, error)) return null;
    throw error;
  }
}
