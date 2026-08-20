import { OG_CONTENT_TYPE, OG_SIZE } from "../../../../src/seo/og-card";
import { pageOgImage } from "../../../../src/seo/page-og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The share card for one CMS page.
 *
 * No `alt` export: Next would need a static string, and the only honest alt
 * for this image is the page's own title, which is already what the card
 * says. An `og:image:alt` in one language on a page served in three would be
 * worse than none.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ region: string; slug: string }>;
}) {
  const { region, slug } = await params;
  return pageOgImage(region, slug, `/${slug}`);
}
