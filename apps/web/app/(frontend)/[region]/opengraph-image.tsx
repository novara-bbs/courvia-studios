import { HOME_SLUG } from "../../../src/content/home-slug";
import { OG_CONTENT_TYPE, OG_SIZE } from "../../../src/seo/og-card";
import { pageOgImage } from "../../../src/seo/page-og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The region home's card. The home is CMS content too — the page with slug
 * "inicio" — so it goes through the same builder and the same fallback
 * chain as any other page.
 *
 * Measured, not assumed: this does NOT reach the sibling routes. /robots and
 * /comparar declare their own `openGraph` object in `generateMetadata`, and a
 * deeper segment's explicit openGraph replaces the parent's resolved images —
 * they end up with no og:image at all, exactly as before. The PDP is the one
 * that already has its own, from real product photography. Giving the
 * catalogue routes a card is a small follow-up, not something this file does
 * by accident.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region } = await params;
  return pageOgImage(region, HOME_SLUG, "");
}
