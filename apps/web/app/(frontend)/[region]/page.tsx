import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { Badge, Card, LinkButton } from "@courvia/ui";
import { SectionList } from "@courvia/sections/render";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { HOME_SLUG } from "../../../src/content/home-slug";
import { getDraftPage, getPage } from "../../../src/content/get-page";
import { makeRenderContext } from "../../../src/content/render-context";
import { setRequestRegion } from "../../../src/i18n/request-region";
import { DraftModeBar } from "../../../src/preview/draft-mode-bar";
import { RefreshRouteOnSave } from "../../../src/preview/refresh-route-on-save";
import { pageMetadata } from "../../../src/seo/page-metadata";
import { regionAlternates } from "../../../src/seo/region-alternates";
import { siteUrl } from "../../../src/seo/site-url";

type PageArgs = { params: Promise<{ region: string }> };

/** The home is CMS content: the page with slug "inicio" (seeded, editable
 *  block by block in the admin). The static markup below is only the
 *  fallback for a database without that page — the site never 500s over
 *  missing marketing content.
 *
 *  It is also the page that is edited most, and until now the only one that
 *  could not be previewed. The chain is worth writing down: the collection
 *  points live preview at `/es/inicio`, that alias 308s to `/es` (the home
 *  never has a second URL — src/content/home-slug.ts), and `/es` is THIS
 *  route. Reading only the published document here meant an editor typed,
 *  autosave persisted a draft every 375 ms, and the iframe kept showing the
 *  published page — with no draft bar to explain why and no click-to-field
 *  bridge either. So this route now branches on draftMode() exactly like
 *  [slug]/page.tsx and robots/[slug]/page.tsx do; the branch is the whole
 *  feature, and src/preview/home-preview.http.test.ts is what holds it. */

// No `instant = false` and no dynamic downgrade, and that was measured
// rather than assumed: with the draftMode() branch below in place `next
// build` still reports `○ /es` (Static), the same mark it printed before
// it. Draft mode is what the `__prerender_bypass` cookie is named after —
// it skips the prerender for that request only — so the published home
// keeps its fully prerendered page and only an authenticated editor pays
// for a render. The sibling content routes are ◐ for an unrelated reason:
// they carry a dynamic [slug].

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const { locale } = REGION_DEFINITIONS[region];
  // The PUBLISHED document, on purpose, in draft mode too — the same choice
  // [slug]/page.tsx and robots/[slug]/page.tsx make, and stated here rather
  // than left implicit. A <title>, a canonical and an og:image are not
  // things the live-preview iframe shows an editor: the panel renders the
  // frame inside its own chrome, so draft metadata would be work nobody can
  // see. Reading the draft here would also cost every request an uncached,
  // overrideAccess query for a value that is thrown away, and would drag
  // metadata out of the cache for visitors as well. If the SEO fields ever
  // need previewing, the honest place is a panel field preview, not this.
  const page = await getPage(HOME_SLUG, locale);
  // No "inicio" document: the static fallback below is what renders, and the
  // region layout's own title/description already describe it correctly.
  if (page === null) return { alternates: regionAlternates(region, "") };
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ page, region, path: "", siteDescription: t("description") });
}

export default async function HomePage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);
  const { locale } = REGION_DEFINITIONS[region];

  // Draft mode is the admin's live preview (src/preview): the signed cookie
  // is only ever set by /next/preview, which authenticates a Payload user
  // first, and the proxy steps aside for it so an unpublished home reaches
  // this component at all.
  const { isEnabled: draft } = await draftMode();
  const page = draft ? await getDraftPage(HOME_SLUG, locale) : await getPage(HOME_SLUG, locale);
  if (page !== null) {
    const tCatalog = await getTranslations({ locale, namespace: "catalog" });
    return (
      <main className="page page--composed">
        {/* Inside <main>, unlike the PDP: .page--composed is a plain single
            column grid (gap: 0), so a sticky full-width bar as its first
            item lands exactly where it should — the PDP had to hoist it out
            because its grid assigns row 1 by name. */}
        {draft ? (
          <>
            {/* The region root, NOT /${region}/inicio: exiting to the alias
                would hand a visitor-facing 308 to an editor who just asked
                to leave preview, and land them here anyway. */}
            <DraftModeBar exitPath={`/${region}`} />
            <RefreshRouteOnSave serverUrl={siteUrl()} />
            {/* PreviewEditingBridge — the client listener that turns a click
                in the frame into "focus this field" — is NOT mounted here,
                and the reason is measured rather than editorial. It imports
                app/(frontend)/preview-editing.css, and Next links a route's
                client-graph CSS from every response that route sends, draft
                or not: /es links four stylesheets today and five with that
                import present (tried statically, with `await import()`
                inside this branch, and with next/dynamic — all five). The
                fifth carries `outline: 1px dashed var(--cv-color-accent)`,
                a HOVER affordance on [data-cv-index], and
                chrome/chrome-shell.test.ts greps the served stylesheet of
                /es for hand-written outlines to keep one focus ring — so
                mounting the bridge here turns that suite red on a rule that
                is not a focus ring at all. Unblocking it is one line in a
                file this session was scoped out of: either give that rule a
                non-`outline` treatment, or narrow the assertion to
                :focus-visible rules. The field index the bridge reads
                (`data-cv-fields`) already ships here — that comes from
                makeRenderContext(draft) below, not from the listener — so
                the day the rule moves, this is one import. */}
          </>
        ) : null}
        <SectionList
          blocks={page.blocks}
          ctx={makeRenderContext(draft, region, tCatalog("conceptRender"))}
        />
      </main>
    );
  }

  // Reached in draft mode too, and correctly: `page === null` after a draft
  // read means no "inicio" document exists in ANY version, so there is no
  // draft to show and no autosave to listen for. Unchanged below this line.
  const t = await getTranslations({ locale, namespace: "home" });
  return (
    <main className="page">
      <header className="hero">
        <Badge variant="accent">{t("eyebrow")}</Badge>
        <h1>
          {t("heading")}
          <span className="ball" aria-hidden="true" />
        </h1>
        <p className="lead">{t("lead")}</p>
        <div className="samples">
          <LinkButton variant="primary" href={`/${region}/robots`}>
            {t("ctaPrimary")}
          </LinkButton>
          <LinkButton variant="ghost" href={`/${region}/comparar`}>
            {t("ctaSecondary")}
          </LinkButton>
        </div>
      </header>

      <section aria-labelledby="pillars">
        <h2 id="pillars">{t("pillarsTitle")}</h2>
        <div className="pillars">
          <Card>
            <h3>{t("pillarTenis")}</h3>
            <p>{t("pillarTenisBody")}</p>
          </Card>
          <Card>
            <h3>{t("pillarPadel")}</h3>
            <p>{t("pillarPadelBody")}</p>
          </Card>
          <Card>
            <h3>{t("pillarPickleball")}</h3>
            <p>{t("pillarPickleballBody")}</p>
          </Card>
        </div>
        <p className="lead">{t("academyNote")}</p>
      </section>
    </main>
  );
}
