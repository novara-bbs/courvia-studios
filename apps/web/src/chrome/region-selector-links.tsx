"use client";

import type { Direction, LocaleId, RegionId, RegionStatus } from "@courvia/platform";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The region links, with the visitor's current path kept.
 *
 * The one fact this file adds is the one a Server Component cannot read:
 * which URL is being shown. Everything visible — the endonyms, the language
 * tags, the direction, the publication status — is resolved on the server in
 * `region-selector.tsx` and arrives as props, so no user-visible string
 * lives in a component and next-intl stays the only place a label changes.
 *
 * Why it matters twice. A person who switches market from a product page
 * wants THAT product in the new market; landing on the front page is the
 * exact moment a lead is abandoned, and it was measured happening from
 * /es/robots/tempo-r1, /es/comparar and /es/tecnologia alike. And `hrefLang`
 * on a link states that the destination is this page's alternate in that
 * language: with every link pointing at `/en-gb`, the footer contradicted,
 * on all 42 URLs of the sitemap, the `<head>` of the very same document,
 * which already declared `/en-gb/robots/tempo-r1`. One missing fact, two
 * symptoms.
 *
 * Keeping the path is safe for every region because a path means the same
 * thing under all of them: a page's `slug` is one shared column across
 * locales and markets (ADR-026 §3), and the routing manifest is not per
 * region, so a URL that resolves under one region resolves under all of
 * them. Which regions may be OFFERED is a different question, answered by
 * VISIBLE_REGIONS before this component sees the list (ADR-025: a prepared
 * region is not linked and not annotated).
 */
export interface RegionLink {
  region: RegionId;
  label: string;
  /** Only a published region declares one (ADR-025). */
  hreflang?: string;
  locale: LocaleId;
  dir: Direction;
  status: RegionStatus;
  current: boolean;
}

/** "/es/robots/tempo-r1" → "/robots/tempo-r1"; "/es" → "". */
function withinRegion(pathname: string): string {
  return /^\/[^/]+(\/.*)?$/.exec(pathname)?.[1] ?? "";
}

export function RegionSelectorLinks({ links }: { links: readonly RegionLink[] }) {
  const path = withinRegion(usePathname());

  return (
    <>
      {links.map((link) => (
        <Link
          key={link.region}
          href={`/${link.region}${path}`}
          // hrefLang declares the language of what is on the other end of
          // this link, which is now true of the page it lands on and not
          // only of the region it belongs to.
          hrefLang={link.hreflang}
          lang={link.locale}
          // Per-link dir, not the page's: a Latin-script endonym inside an
          // RTL nav reorders its punctuation without it.
          dir={link.dir}
          // The status a test can read: the production footer must contain
          // no prepared link at all.
          data-region-status={link.status}
          aria-current={link.current ? "true" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}
