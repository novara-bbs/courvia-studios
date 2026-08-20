/**
 * One published page by slug and locale, cached under its own tag: the
 * pages collection's afterChange hook revalidates `page:{slug}` on publish.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { isDatabaselessBuild } from "../server/build-env";

export interface PageDocument {
  slug: string;
  title: string;
  blocks: unknown;
}

export async function getPage(slug: string, locale: LocaleId): Promise<PageDocument | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`page:${slug}`, "media");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "pages",
      where: { slug: { equals: slug }, _status: { equals: "published" } },
      locale,
      limit: 1,
      depth: 1,
    });
    const doc = result.docs[0];
    if (doc === undefined) return null;
    return { slug: doc.slug, title: doc.title, blocks: doc.blocks ?? [] };
  } catch (error) {
    console.error(`page read failed for "${slug}"`, error);
    if (isDatabaselessBuild(`the page "${slug}"`, error)) return null;
    throw error;
  }
}

/**
 * Published slugs, for build-time prerender and for the sitemap.
 *
 * This used to end in a bare `catch { return [] }`, which is the worst
 * possible shape for a function that feeds the sitemap: a failed query
 * became a sitemap with no pages in it, cached for a year, and nothing
 * anywhere said so. Now it answers empty only where empty is correct.
 */
export async function listPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag("pages", "media");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "pages",
      where: { _status: { equals: "published" } },
      limit: 200,
      depth: 0,
      select: { slug: true },
    });
    return result.docs.map((doc) => doc.slug);
  } catch (error) {
    console.error("published slug listing failed", error);
    if (isDatabaselessBuild("the list of published page slugs", error)) return [];
    throw error;
  }
}

/**
 * Draft-aware read for preview: uncached and version-inclusive. Callers must
 * gate on draftMode().isEnabled — the signed draft cookie can only be set by
 * the authenticated /next/preview endpoint, which is the actual access gate.
 */
export async function getDraftPage(slug: string, locale: LocaleId): Promise<PageDocument | null> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "pages",
    where: { slug: { equals: slug } },
    locale,
    limit: 1,
    depth: 1,
    draft: true,
    overrideAccess: true,
  });
  const doc = result.docs[0];
  if (doc === undefined) return null;
  return { slug: doc.slug, title: doc.title, blocks: doc.blocks ?? [] };
}
