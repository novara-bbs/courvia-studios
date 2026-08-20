import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { listRobots } from "../../../../src/catalog/get-catalog";
import { ProductCard } from "../../../../src/catalog/product-card";
import { setRequestRegion } from "../../../../src/i18n/request-region";
import { regionAlternates } from "../../../../src/seo/region-alternates";

type PageArgs = { params: Promise<{ region: string }> };

// Request-rendered with tagged caching ("catalog"): publishing a product or
// touching a price revalidates the tag; between publishes this is static.
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const t = await getTranslations({
    locale: REGION_DEFINITIONS[region].locale,
    namespace: "catalog",
  });
  return {
    title: t("listTitle"),
    description: t("listDescription"),
    alternates: regionAlternates(region, "/robots"),
    openGraph: {
      title: t("listTitle"),
      description: t("listDescription"),
      url: `/${region}/robots`,
      siteName: "Courvia",
      type: "website",
    },
  };
}

export default async function RobotsPage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  const [t, robots] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "catalog" }),
    listRobots(region),
  ]);

  return (
    <main className="page">
      <header className="catalog-head">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("listTitle")}</h1>
        <p className="lead">{t("listDescription")}</p>
      </header>

      {robots.length === 0 ? (
        <p className="catalog-empty">{t("empty")}</p>
      ) : (
        <ul className="catalog-grid">
          {robots.map((robot) => (
            <li key={robot.id}>
              <ProductCard robot={robot} region={region} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
