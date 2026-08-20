import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { SectionList } from "@courvia/sections/render";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { HOME_SLUG } from "../../../../src/content/home-slug";
import { setRequestRegion } from "../../../../src/i18n/request-region";
import { getDraftPage, getPage } from "../../../../src/content/get-page";
import { makeRenderContext } from "../../../../src/content/render-context";
import { DraftModeBar } from "../../../../src/preview/draft-mode-bar";
import { RefreshRouteOnSave } from "../../../../src/preview/refresh-route-on-save";
import { pageMetadata } from "../../../../src/seo/page-metadata";
import { siteUrl } from "../../../../src/seo/site-url";

type PageArgs = { params: Promise<{ region: string; slug: string }> };

// [slug], not [...slug]. This route only ever served a single segment — it
// answered notFound() for anything deeper — and a catch-all cannot carry an
// `opengraph-image` sibling ("Catch-all must be the last part of the URL",
// next build). One segment is also the truth about the content model: a page
// has a flat, unique slug. Deeper URLs now match no route at all, which is
// how they get a real 404 for free.
//
// Request-rendered with per-slug tagged caching: the first hit renders and
// caches (ISR-equivalent) and publish revalidates the tag.
//
// An unknown slug no longer reaches this component at all: the proxy
// resolves it against the routing manifest before anything streams and
// rewrites it to a real 404 (ADR-026). The notFound() calls below stay as
// the honest fallback for the seconds-wide window where the manifest is
// stale or unavailable — there they still stream the localized not-found UI
// with a 200 and a framework-injected noindex, which is what this route did
// for every miss until now. generateStaticParams is deliberately absent:
// under cacheComponents it must return >=1 result, which no empty/CI
// database can.
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region, slug } = await params;
  if (!isRegionId(region)) return {};
  const { locale } = REGION_DEFINITIONS[region];
  const page = await getPage(slug, locale);
  if (page === null) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  // Every fallback lives in pageMetadata: this route decides nothing.
  return pageMetadata({
    page,
    region,
    path: `/${page.slug}`,
    siteDescription: t("description"),
  });
}

export default async function CmsPage({ params }: PageArgs) {
  const { region, slug } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);
  // The home page's content doc: it lives at the region root, never at a
  // second URL of its own (duplicate content).
  if (slug === HOME_SLUG) permanentRedirect(`/${region}`);

  const { isEnabled: draft } = await draftMode();
  const locale = REGION_DEFINITIONS[region].locale;
  const page = draft ? await getDraftPage(slug, locale) : await getPage(slug, locale);
  if (page === null) notFound();
  const tCatalog = await getTranslations({ locale, namespace: "catalog" });

  return (
    <main className="page page--composed">
      {draft ? (
        <>
          <DraftModeBar exitPath={`/${region}/${page.slug}`} />
          <RefreshRouteOnSave serverUrl={siteUrl()} />
        </>
      ) : null}
      <SectionList
        blocks={page.blocks}
        ctx={makeRenderContext(draft, region, tCatalog("conceptRender"))}
      />
    </main>
  );
}
