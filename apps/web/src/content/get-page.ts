/**
 * One published page by slug and locale, cached under its own tag: the
 * pages collection's afterChange hook revalidates `page:{slug}` on publish.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

export interface PageDocument {
  slug: string;
  title: string;
  blocks: unknown;
}

export async function getPage(slug: string, locale: LocaleId): Promise<PageDocument | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`page:${slug}`);
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
    if (process.env.NEXT_PHASE === "phase-production-build") return null;
    console.error(`page read failed for "${slug}"`, error);
    throw error;
  }
}

/** Published slugs, for build-time prerender. Empty in DB-less CI builds. */
export async function listPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag("pages");
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
  } catch {
    return [];
  }
}
