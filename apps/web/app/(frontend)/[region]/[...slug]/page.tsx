import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { SectionList } from "@courvia/sections/render";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { setRequestRegion } from "../../../../src/i18n/request-region";
import { getDraftPage, getPage } from "../../../../src/content/get-page";
import { makeRenderContext } from "../../../../src/content/render-context";
import { DraftModeBar } from "../../../../src/preview/draft-mode-bar";
import { RefreshRouteOnSave } from "../../../../src/preview/refresh-route-on-save";
import { regionAlternates } from "../../../../src/seo/region-alternates";
import { siteUrl } from "../../../../src/seo/site-url";

type PageArgs = { params: Promise<{ region: string; slug: string[] }> };

// Request-rendered with per-slug tagged caching: the first hit renders and
// caches (ISR-equivalent) and publish revalidates the tag. An unknown slug
// streams the localized not-found UI with a 200 + framework-injected
// noindex (the documented Cache Components behaviour; out-of-tree URLs get
// real 404s from global-not-found). generateStaticParams is deliberately
// absent: under cacheComponents it must return >=1 result, which no
// empty/CI database can.
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region, slug } = await params;
  if (!isRegionId(region) || slug.length !== 1 || slug[0] === undefined) return {};
  const page = await getPage(slug[0], REGION_DEFINITIONS[region].locale);
  if (page === null) return {};
  return {
    title: page.title,
    alternates: regionAlternates(region, `/${page.slug}`),
  };
}

export default async function CmsPage({ params }: PageArgs) {
  const { region, slug } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);
  // Nested paths are reserved for future scoped routes (robots/, academy/…).
  if (slug.length !== 1 || slug[0] === undefined) notFound();

  const { isEnabled: draft } = await draftMode();
  const locale = REGION_DEFINITIONS[region].locale;
  const page = draft ? await getDraftPage(slug[0], locale) : await getPage(slug[0], locale);
  if (page === null) notFound();

  return (
    <main className="page">
      {draft ? (
        <>
          <DraftModeBar exitPath={`/${region}/${page.slug}`} />
          <RefreshRouteOnSave serverUrl={siteUrl()} />
        </>
      ) : null}
      <SectionList blocks={page.blocks} ctx={makeRenderContext(draft)} />
    </main>
  );
}
