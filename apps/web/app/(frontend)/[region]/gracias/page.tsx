import { REGION_DEFINITIONS, REGIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { setRequestRegion } from "../../../../src/i18n/request-region";

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
  return { title: t("title"), robots: { index: false } };
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
