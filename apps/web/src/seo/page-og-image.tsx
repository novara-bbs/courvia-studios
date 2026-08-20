/**
 * The server half of the generated Open Graph card: read the page, resolve
 * the same strings the <head> resolves, paint the PNG.
 *
 * Messages are imported statically rather than through `getTranslations`.
 * This is a cached image route, not a request-scoped render — the same
 * reason `not-found.tsx` does it — and the only message it needs is the
 * site description, the last link of the description chain.
 */
import { ImageResponse } from "next/og";
import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { LocaleId } from "@courvia/platform";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { getPage } from "../content/get-page";
import { getSiteTheme } from "../theme/get-site-theme";
import { OG_SIZE, ogCard } from "./og-card";
import { describePage, summarize } from "./page-metadata";
import { siteUrl } from "./site-url";

const MESSAGES: Record<LocaleId, typeof es> = { es, en, ar };

/** Shorter than the meta description: a 155-character paragraph under a
 *  78px headline is a wall, and social crops it anyway. */
const CARD_DESCRIPTION_MAX = 110;

/** "courvia.com/es/tecnologia" — the origin without its scheme. */
function displayUrl(path: string): string {
  return `${siteUrl().replace(/^https?:\/\//, "")}${path}`;
}

/**
 * @param region the `[region]` param, unvalidated (it is a URL segment).
 * @param slug   which page document to describe.
 * @param path   the path below the region, for the card's footer.
 */
export async function pageOgImage(
  region: string,
  slug: string,
  path: string,
): Promise<ImageResponse> {
  const regionId = isRegionId(region) ? region : null;
  const locale: LocaleId = regionId === null ? "es" : REGION_DEFINITIONS[regionId].locale;
  const siteDescription = MESSAGES[locale].meta.description;

  const [theme, page] = await Promise.all([getSiteTheme(), getPage(slug, locale)]);

  const described =
    page === null
      ? { title: MESSAGES[locale].meta.title, description: siteDescription }
      : describePage(page, siteDescription);

  return new ImageResponse(
    ogCard({
      theme,
      title: described.title,
      description: summarize(described.description, CARD_DESCRIPTION_MAX),
      url: displayUrl(`/${region}${path}`),
    }),
    OG_SIZE,
  );
}
