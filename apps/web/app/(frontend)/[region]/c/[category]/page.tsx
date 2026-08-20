import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { listRobotsInCategory } from "../../../../../src/catalog/get-catalog";
import { getCategory } from "../../../../../src/catalog/get-category";
import { ProductCard } from "../../../../../src/catalog/product-card";
import { setRequestRegion } from "../../../../../src/i18n/request-region";
import { regionAlternates } from "../../../../../src/seo/region-alternates";

type PageArgs = { params: Promise<{ region: string; category: string }> };

// Request-rendered, cached under "catalog": creating a product in the
// category — or renaming the category — revalidates this page.
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region, category: slug } = await params;
  if (!isRegionId(region)) return {};
  const category = await getCategory(slug, REGION_DEFINITIONS[region].locale);
  if (category === null) return {};
  return {
    title: category.title,
    description: category.description,
    alternates: regionAlternates(region, `/c/${category.slug}`),
    openGraph: {
      title: category.title,
      description: category.description,
      url: `/${region}/c/${category.slug}`,
      siteName: "Courvia",
      type: "website",
      ...(category.image === undefined ? {} : { images: [{ url: category.image.url }] }),
    },
  };
}

export default async function CategoryPage({ params }: PageArgs) {
  const { region, category: slug } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  const [t, category] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "catalog" }),
    getCategory(slug, def.locale),
  ]);
  if (category === null) notFound();
  const robots = await listRobotsInCategory(category.id, region);

  return (
    <main className="page">
      <header className="catalog-head">
        <h1>{category.title}</h1>
        {category.description === undefined ? null : (
          <p className="lead">{category.description}</p>
        )}
        {category.image === undefined ? null : (
          <figure className="category-media">
            <Image
              src={category.image.url}
              alt={category.image.alt}
              width={category.image.width ?? 1600}
              height={category.image.height ?? 900}
              sizes="(max-width: 860px) 100vw, 860px"
              priority
            />
          </figure>
        )}
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
