import { DEFAULT_REGION, REGION_DEFINITIONS, REGIONS } from "@courvia/platform";

import { siteUrl } from "../seo/site-url";

/**
 * Preview URLs, in one place because three entities need the same two
 * decisions: which region an editing locale maps to, and that the site is
 * only ever entered through `/next/preview` (which authenticates the Payload
 * cookie and turns draft mode on — see app/(frontend)/next/preview/route.ts).
 */

/** The region whose locale matches the admin's editing locale. */
export function previewRegion(localeCode: string): string {
  return REGIONS.find((r) => REGION_DEFINITIONS[r].locale === localeCode) ?? DEFAULT_REGION;
}

/** An authenticated, draft-enabled entry point to a region-relative path. */
export function previewUrl(path: string): string {
  return `${siteUrl()}/next/preview?path=${encodeURIComponent(path)}`;
}
