import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { SectionList } from "@courvia/sections/render";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getDraftRobot, getRobot, listRobots } from "../../../../../src/catalog/get-catalog";
import { makeProductSurfaces, productSubjectOf } from "../../../../../src/catalog/pdp-surfaces";
import {
  getDraftProductTemplate,
  getProductTemplate,
} from "../../../../../src/catalog/product-template";
import { makeRenderContext, renderRichText } from "../../../../../src/content/render-context";
import { setRequestRegion } from "../../../../../src/i18n/request-region";
import { DraftModeBar } from "../../../../../src/preview/draft-mode-bar";
import { RefreshRouteOnSave } from "../../../../../src/preview/refresh-route-on-save";
import { ProductJsonLd } from "../../../../../src/seo/product-json-ld";
import { regionAlternates } from "../../../../../src/seo/region-alternates";
import { siteUrl } from "../../../../../src/seo/site-url";

type PageArgs = { params: Promise<{ region: string; slug: string }> };

// Request-rendered, cached under `product:{slug}` + "catalog": publish or
// price change revalidates only what changed (see catalog-revalidation.ts).
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region, slug } = await params;
  if (!isRegionId(region)) return {};
  const detail = await getRobot(slug, region);
  if (detail === null) return {};
  const image = detail.product.images?.[0];
  return {
    title: detail.product.title,
    description: detail.product.excerpt,
    alternates: regionAlternates(region, `/robots/${detail.product.slug}`),
    openGraph: {
      title: detail.product.title,
      description: detail.product.excerpt,
      url: `/${region}/robots/${detail.product.slug}`,
      siteName: "Courvia",
      type: "website",
      // Relative URLs resolve against metadataBase (set in the layout).
      ...(image === undefined
        ? {}
        : { images: [{ url: image.url, width: image.width, height: image.height, alt: image.alt }] }),
    },
    twitter: { card: image === undefined ? "summary" : "summary_large_image" },
  };
}

/**
 * The product page, composed from a TEMPLATE rather than written out here
 * (WP13).
 *
 * What this route still decides: which product, which region, published or
 * draft, and the schema.org block. What it no longer decides is the ORDER of
 * the page — a template does, and a product may point at its own. The
 * markup of each piece lives in src/catalog/pdp-surfaces.tsx, unchanged from
 * the version this replaced; the bound sections of @courvia/sections place
 * it. Three files instead of one, and the middle one is editable.
 *
 * `<main>` keeps `page page--pdp`, and `.page--pdp` now opts out of `.page`'s
 * measure and inline padding the way `.page--composed` does: each band spans
 * the shell and its own `.cv-section-inner` carries the 1180px cap and the
 * 24px gutters — the same numbers, applied one level down. The block rhythm
 * (64px of padding, 32px between bands) stays on the shell, which is why the
 * default template pins every band's own spacing to `none`.
 */
export default async function RobotDetailPage({ params }: PageArgs) {
  const { region, slug } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  // Draft mode is the admin's live preview (src/preview): it renders the
  // autosaved version instead of the published one, and the proxy already
  // steps aside for the draft cookie so an unpublished slug reaches this
  // component at all.
  const { isEnabled: draft } = await draftMode();
  const [detail, catalogue, blocks] = await Promise.all([
    draft ? getDraftRobot(slug, region) : getRobot(slug, region),
    listRobots(region),
    draft ? getDraftProductTemplate(slug) : getProductTemplate(slug),
  ]);
  if (detail === null) notFound();

  const { product } = detail;
  const related = catalogue.filter((other) => other.slug !== product.slug);
  // The concept-render label reaches the context even though the product
  // gallery translates its own: a template may interleave marketing sections
  // (`hotspots`, `gallery`) that show non-final assets too, and E-028 does
  // not care which section drew them.
  const [t, surfaces] = await Promise.all([
    getTranslations({ locale: REGION_DEFINITIONS[region].locale, namespace: "catalog" }),
    makeProductSurfaces({ detail, region, related, renderRichText }),
  ]);
  const ctx = makeRenderContext(draft, region, t("conceptRender"), {
    subject: productSubjectOf(detail, region, related),
    renderProductSurface: surfaces,
  });

  return (
    <>
      {/* Editor chrome, and it stays OUTSIDE <main> because it is not page
          content — and because <main> is a grid of bands, where a full-width
          bar dropped in as one more item would land wherever auto-placement
          put it. Before the main element it is a block in normal flow, which
          is what a sticky bar wants. */}
      {draft ? (
        <>
          <DraftModeBar exitPath={`/${region}/robots/${product.slug}`} />
          <RefreshRouteOnSave serverUrl={siteUrl()} />
        </>
      ) : null}
      <main className="page page--pdp">
        <SectionList blocks={blocks} ctx={ctx} />
        <ProductJsonLd detail={detail} region={region} />
      </main>
    </>
  );
}
