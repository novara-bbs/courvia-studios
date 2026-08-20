/**
 * Category reads for the dynamic category pages (/{región}/c/{slug}).
 * Categories are catalog navigation surface: cached under the same
 * "catalog" tag their afterChange hook revalidates.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { isDatabaselessBuild } from "../server/build-env";

export interface CategoryView {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: { url: string; alt: string; width?: number; height?: number };
}

export async function getCategory(slug: string, locale: LocaleId): Promise<CategoryView | null> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "categories",
      where: { slug: { equals: slug } },
      locale,
      limit: 1,
      depth: 1,
      overrideAccess: true,
    });
    const doc = result.docs[0];
    if (doc === undefined) return null;
    const image = doc.image;
    return {
      id: String(doc.id),
      slug: doc.slug,
      title: doc.title,
      ...(typeof doc.description === "string" && doc.description !== ""
        ? { description: doc.description }
        : {}),
      ...(typeof image === "object" && image !== null && typeof image.url === "string"
        ? {
            image: {
              url: image.url,
              alt: typeof image.alt === "string" ? image.alt : "",
              ...(typeof image.width === "number" ? { width: image.width } : {}),
              ...(typeof image.height === "number" ? { height: image.height } : {}),
            },
          }
        : {}),
    };
  } catch (error) {
    console.error(`category read failed for "${slug}"`, error);
    if (isDatabaselessBuild(`the "${slug}" category page`, error)) return null;
    throw error;
  }
}

/** All category slugs, for the sitemap. Empty only in a databaseless local
 *  build: a bare `catch {}` here used to hide a failing query behind an
 *  empty sitemap cached for a year. */
export async function listCategorySlugs(): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "categories",
      limit: 100,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
    });
    return result.docs.map((doc) => doc.slug);
  } catch (error) {
    console.error("category slug listing failed", error);
    if (isDatabaselessBuild("the category list for the sitemap", error)) return [];
    throw error;
  }
}
