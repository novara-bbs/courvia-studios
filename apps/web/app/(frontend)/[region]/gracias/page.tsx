import { REGION_DEFINITIONS, REGIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { setRequestRegion } from "../../../../src/i18n/request-region";
import { composeRobots } from "../../../../src/seo/page-metadata";

type PageArgs = { params: Promise<{ region: string }> };

export function generateStaticParams() {
  return REGIONS.map((region) => ({ region }));
}

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const t = await getTranslations({
    locale: REGION_DEFINITIONS[region].locale,
    namespace: "thanks",
  });
  // Deliberately no canonical/hreflang: a post-submit confirmation is not a
  // landing page and must not be indexed.
  //
  // But `robots` must be COMPOSED, not written flat. Next merges metadata
  // shallowly, so a key defined here replaces the layout's whole object —
  // and the layout is where a prepared region gets its `follow: false`
  // (ADR-025). A flat `{ index: false }` therefore emitted `noindex` with no
  // `nofollow` on /ar-ae/gracias, re-authorising a crawler to follow the
  // links out of it into the very region tree the layout had just closed.
  return { title: t("title"), robots: composeRobots(region, true) };
}

export default async function ThanksPage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const t = await getTranslations({
    locale: REGION_DEFINITIONS[region].locale,
    namespace: "thanks",
  });

  return (
    <main className="page">
      <header className="catalog-head">
        <h1>{t("title")}</h1>
        <p className="lead">{t("body")}</p>
        <p>
          <Link href={`/${region}/robots`}>{t("back")}</Link>
        </p>
      </header>
    </main>
  );
}
