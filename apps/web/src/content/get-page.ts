/**
 * One published page by slug and locale, cached under its own tag: the
 * pages collection's afterChange hook revalidates `page:{slug}` on publish.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import type { PageSeoFields, PageSeoImage } from "../seo/page-metadata";
import { isDatabaselessBuild } from "../server/build-env";

export interface PageDocument {
  slug: string;
  title: string;
  blocks: unknown;
  /** Always present, always resolved: the fallback chain lives in
   *  src/seo/page-metadata.ts, and a route must never have to ask whether
   *  the editor filled a field in. */
  seo: PageSeoFields;
}

interface RawSeo {
  title?: unknown;
  description?: unknown;
  ogImage?: unknown;
  noIndex?: unknown;
}

/** Only a populated upload counts: with depth:1 an unresolved relation
 *  arrives as a bare id, and an id is not an image URL. */
function seoImage(value: unknown): PageSeoImage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const media = value as { url?: unknown; width?: unknown; height?: unknown; alt?: unknown };
  if (typeof media.url !== "string" || media.url === "") return undefined;
  return {
    url: media.url,
    ...(typeof media.width === "number" ? { width: media.width } : {}),
    ...(typeof media.height === "number" ? { height: media.height } : {}),
    alt: typeof media.alt === "string" ? media.alt : "",
  };
}

function readSeo(value: unknown): PageSeoFields {
  const raw = (typeof value === "object" && value !== null ? value : {}) as RawSeo;
  const image = seoImage(raw.ogImage);
  return {
    ...(typeof raw.title === "string" && raw.title !== "" ? { title: raw.title } : {}),
    ...(typeof raw.description === "string" && raw.description !== ""
      ? { description: raw.description }
      : {}),
    ...(image === undefined ? {} : { image }),
    noIndex: raw.noIndex === true,
  };
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
    return { slug: doc.slug, title: doc.title, blocks: doc.blocks ?? [], seo: readSeo(doc.seo) };
  } catch (error) {
    console.error(`page read failed for "${slug}"`, error);
    if (isDatabaselessBuild(`the page "${slug}"`, error)) return null;
    throw error;
  }
}

/**
 * Every published slug — including the ones marked `noIndex`.
 *
 * This is the list that answers "does this URL exist", so it feeds the
 * routing manifest the proxy reads. A page an editor took out of the index
 * is still a page: it is linked, it is navigable, and answering 404 for it
 * would be a far bigger statement than the one the checkbox makes.
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
 * The slugs we ASK a crawler to index: published, minus the ones an editor
 * marked `noIndex`.
 *
 * The distinction is not pedantry. sitemap.ts already refuses to list a
 * prepared region because "un sitemap es una petición de indexar mientras
 * sus páginas responden noindex, y pedir una URL que luego rechazamos es
 * exactamente la contradicción que Search Console reporta". A per-page
 * checkbox that left the page in the sitemap would create that same
 * contradiction one row lower down, and llms.txt would keep advertising it
 * to assistants on top.
 */
export async function listIndexableSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag("pages", "media");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "pages",
      where: {
        _status: { equals: "published" },
        // not_equals(true) rather than equals(false): the column is null for
        // every page written before the field existed.
        "seo.noIndex": { not_equals: true },
      },
      limit: 200,
      depth: 0,
      select: { slug: true },
    });
    return result.docs.map((doc) => doc.slug);
  } catch (error) {
    console.error("indexable slug listing failed", error);
    if (isDatabaselessBuild("the list of indexable page slugs", error)) return [];
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
  return { slug: doc.slug, title: doc.title, blocks: doc.blocks ?? [], seo: readSeo(doc.seo) };
}
