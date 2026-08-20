import { REGION_DEFINITIONS, REGIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Plain links, one per region: crawlable, indexable, and they never force a
 * region on anyone (docs/markets.md §9: negotiation suggests, never forces).
 *
 * The labels are endonyms — every region names itself in its own language and
 * script — so the three message files carry identical strings on purpose: a
 * visitor scanning for their language looks for "العربية", not for whatever
 * the current page calls Arabic. They still live in next-intl rather than in
 * this file because no user-visible string belongs in a component, and an
 * editor must be able to rename a market without a deploy.
 */
export async function RegionSelector({ current, label }: { current: RegionId; label: string }) {
  const t = await getTranslations({
    locale: REGION_DEFINITIONS[current].locale,
    namespace: "regions",
  });

  return (
    <nav aria-label={label} className="region-selector">
      {REGIONS.map((region) => {
        const def = REGION_DEFINITIONS[region];
        return (
          <Link
            key={region}
            href={`/${region}`}
            hrefLang={def.hreflang}
            lang={def.locale}
            // Per-link dir, not the page's: a Latin-script endonym inside an
            // RTL nav reorders its punctuation without it.
            dir={def.dir}
            aria-current={region === current ? "true" : undefined}
          >
            {t(region)}
          </Link>
        );
      })}
    </nav>
  );
}
