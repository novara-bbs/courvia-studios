import { REGION_DEFINITIONS, REGIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import Link from "next/link";

const REGION_LABELS: Record<RegionId, string> = {
  es: "España · Español",
  "en-gb": "United Kingdom · English",
  "en-ae": "UAE · English",
  "ar-ae": "الإمارات · العربية",
};

/**
 * Plain links, one per region: crawlable, indexable, and they never force a
 * region on anyone (docs/markets.md §9: negotiation suggests, never forces).
 */
export function RegionSelector({ current, label }: { current: RegionId; label: string }) {
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
            aria-current={region === current ? "true" : undefined}
          >
            {REGION_LABELS[region]}
          </Link>
        );
      })}
    </nav>
  );
}
