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

export async function listRobots(region: RegionId): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market });
  } catch (error) {
    if (process.env.NEXT_PHASE === "phase-production-build") return [];
    console.error(`catalog listing failed for region "${region}"`, error);
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
    if (process.env.NEXT_PHASE === "phase-production-build") return null;
    console.error(`product read failed for "${slug}"`, error);
    throw error;
  }
}
