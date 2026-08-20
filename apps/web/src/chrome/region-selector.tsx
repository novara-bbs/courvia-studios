import { PREPARED_REGIONS, PUBLISHED_REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Plain links, one per published region: crawlable, indexable, and they never
 * force a region on anyone (docs/markets.md §9: negotiation suggests, never
 * forces).
 *
 * The labels are endonyms — every region names itself in its own language and
 * script — so the three message files carry identical strings on purpose: a
 * visitor scanning for their language looks for "العربية", not for whatever
 * the current page calls Arabic. They still live in next-intl rather than in
 * this file because no user-visible string belongs in a component, and an
 * editor must be able to rename a market without a deploy.
 *
 * PREPARED regions are absent in production, for two reasons that point the
 * same way. To a crawler this footer is a site-wide block of `hrefLang`
 * links: leaving "ar-AE" in it would re-declare, on every page, the Arabic
 * site the sitemap and the hreflang cluster have just stopped claiming. And
 * to a person it is worse — clicking "العربية" lands them on Spanish prose
 * under `lang="ar"`, which is a promise the site cannot keep.
 *
 * They are still one click away while `next dev` runs, so the RTL layout
 * stays easy to look at. Everywhere else — including preview deploys, which
 * are production builds — the route is reached by typing its URL, which is
 * all a test or a reviewer needs and is not a declaration to anyone.
 */
export const VISIBLE_REGIONS: readonly RegionId[] =
  process.env.NODE_ENV === "production"
    ? PUBLISHED_REGIONS
    : [...PUBLISHED_REGIONS, ...PREPARED_REGIONS];

export async function RegionSelector({ current, label }: { current: RegionId; label: string }) {
  const t = await getTranslations({
    locale: REGION_DEFINITIONS[current].locale,
    namespace: "regions",
  });

  return (
    <nav aria-label={label} className="region-selector">
      {VISIBLE_REGIONS.map((region) => {
        const def = REGION_DEFINITIONS[region];
        return (
          <Link
            key={region}
            href={`/${region}`}
            // hrefLang states "this link is the alternate of this page in
            // that language", so only a published region may carry it.
            hrefLang={def.status === "published" ? def.hreflang : undefined}
            lang={def.locale}
            // Per-link dir, not the page's: a Latin-script endonym inside an
            // RTL nav reorders its punctuation without it.
            dir={def.dir}
            // The status a test can read: the production footer must contain
            // no prepared link at all.
            data-region-status={def.status}
            aria-current={region === current ? "true" : undefined}
          >
            {t(region)}
          </Link>
        );
      })}
    </nav>
  );
}
