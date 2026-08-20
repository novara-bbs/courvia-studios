import { format } from "@courvia/commerce-domain";
import type { ProductDetail } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getRobot, listRobots } from "../../../../src/catalog/get-catalog";
import { setRequestRegion } from "../../../../src/i18n/request-region";
import { regionAlternates } from "../../../../src/seo/region-alternates";

type PageArgs = { params: Promise<{ region: string }> };

// Request-rendered, cached under "catalog": any price/spec/publish change
// revalidates it together with the listing and the PDPs.
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "compare" });
  return {
    title: t("title"),
    description: t("lead"),
    alternates: regionAlternates(region, "/comparar"),
  };
}

/** Spec keys in first-seen order across products, so the comparator aligns
 *  rows by the stable machine key while labels stay localized. */
function specRows(details: ProductDetail[]): { key: string; label: string; unit?: string }[] {
  const rows = new Map<string, { key: string; label: string; unit?: string }>();
  for (const detail of details) {
    for (const spec of detail.product.specs) {
      if (!rows.has(spec.key)) rows.set(spec.key, spec);
    }
  }
  return [...rows.values()];
}

export default async function ComparePage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  const [t, tCatalog, summaries] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "compare" }),
    getTranslations({ locale: def.locale, namespace: "catalog" }),
    listRobots(region),
  ]);
  const details = (
    await Promise.all(summaries.map((summary) => getRobot(summary.slug, region)))
  ).filter((detail): detail is ProductDetail => detail !== null);

  return (
    <main className="page">
      <header className="catalog-head">
        <h1>{t("title")}</h1>
        <p className="lead">{t("lead")}</p>
      </header>

      {details.length === 0 ? (
        <p className="catalog-empty">{tCatalog("empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="compare-table">
            <caption className="visually-hidden">{t("title")}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{t("colFeature")}</span>
                </th>
                {details.map((detail) => (
                  <th scope="col" key={detail.product.id}>
                    <Link href={`/${region}/robots/${detail.product.slug}`}>
                      {detail.product.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t("rowPrice")}</th>
                {details.map((detail) => {
                  const fromPrice = detail.variants.reduce<
                    ProductDetail["variants"][number]["price"]
                  >(
                    (lowest, offer) =>
                      offer.price === null
                        ? lowest
                        : lowest === null || offer.price.amount < lowest.amount
                          ? offer.price
                          : lowest,
                    null,
                  );
                  return (
                    <td key={detail.product.id}>
                      {fromPrice === null
                        ? tCatalog("notSoldHere")
                        : tCatalog("fromPrice", { price: format(fromPrice, def.hreflang) })}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">{t("rowSports")}</th>
                {details.map((detail) => (
                  <td key={detail.product.id}>
                    {detail.product.sports.map((sport) => tCatalog(`sport.${sport}`)).join(" · ")}
                  </td>
                ))}
              </tr>
              {specRows(details).map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {details.map((detail) => {
                    const spec = detail.product.specs.find((s) => s.key === row.key);
                    return (
                      <td key={detail.product.id}>
                        {spec === undefined
                          ? "—"
                          : `${spec.value}${spec.unit === undefined ? "" : ` ${spec.unit}`}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">{t("rowWarranty")}</th>
                {details.map((detail) => (
                  <td key={detail.product.id}>
                    {detail.product.warrantyMonths === undefined
                      ? "—"
                      : t("warrantyValue", { months: detail.product.warrantyMonths })}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">
                  <span className="visually-hidden">{t("rowCta")}</span>
                </th>
                {details.map((detail) => (
                  <td key={detail.product.id}>
                    <Link className="compare-cta" href={`/${region}/robots/${detail.product.slug}`}>
                      {t("cta")}
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
