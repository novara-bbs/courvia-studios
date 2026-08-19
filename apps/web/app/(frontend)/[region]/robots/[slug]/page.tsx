import { format, type Money } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getRobot } from "../../../../../src/catalog/get-catalog";
import { makeRenderContext } from "../../../../../src/content/render-context";
import { setRequestRegion } from "../../../../../src/i18n/request-region";
import { LeadForm } from "../../../../../src/leads/lead-form";
import { regionAlternates } from "../../../../../src/seo/region-alternates";

type PageArgs = { params: Promise<{ region: string; slug: string }> };

// Request-rendered, cached under `product:{slug}` + "catalog": publish or
// price change revalidates only what changed (see catalog-revalidation.ts).
export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region, slug } = await params;
  if (!isRegionId(region)) return {};
  const detail = await getRobot(slug, region);
  if (detail === null) return {};
  return {
    title: detail.product.title,
    description: detail.product.excerpt,
    alternates: regionAlternates(region, `/robots/${detail.product.slug}`),
  };
}

export default async function RobotDetailPage({ params }: PageArgs) {
  const { region, slug } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  const [t, detail] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "catalog" }),
    getRobot(slug, region),
  ]);
  if (detail === null) notFound();

  const { product, variants } = detail;
  const ctx = makeRenderContext(false);
  const fromPrice = variants.reduce<Money | null>(
    (lowest, offer) => pickLower(lowest, offer.price),
    null,
  );

  return (
    <main className="page">
      <header className="pdp-head">
        <p className="eyebrow">{product.sports.map((sport) => t(`sport.${sport}`)).join(" · ")}</p>
        <h1>{product.title}</h1>
        {product.excerpt === undefined ? null : <p className="lead">{product.excerpt}</p>}
        {fromPrice === null ? null : (
          <p className="pdp-price">{t("fromPrice", { price: format(fromPrice, def.hreflang) })}</p>
        )}
      </header>

      <section className="pdp-variants" aria-labelledby="pdp-variants-title">
        <h2 id="pdp-variants-title">{t("variantsTitle")}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("variantSku")}</th>
                <th scope="col">{t("variantSport")}</th>
                <th scope="col">{t("variantPrice")}</th>
                <th scope="col">{t("variantAvailability")}</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((offer) => (
                <tr key={offer.id}>
                  <th scope="row">{offer.sku}</th>
                  <td>{t(`sport.${offer.sport}`)}</td>
                  <td>{offer.price === null ? "—" : format(offer.price, def.hreflang)}</td>
                  <td>
                    {offer.available > 0 ? (
                      <span className="stock stock--in">{t("inStock")}</span>
                    ) : (
                      <span className="stock stock--out">{t("outOfStock")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {product.description === undefined || product.description === null ? null : (
        <section className="pdp-description cv-prose">
          {ctx.renderRichText(product.description)}
        </section>
      )}

      {product.specs.length === 0 ? null : (
        <section className="pdp-specs" aria-labelledby="pdp-specs-title">
          <h2 id="pdp-specs-title">{t("specsTitle")}</h2>
          <dl className="specs-list">
            {product.specs.map((spec) => (
              <div key={spec.key} className="specs-row">
                <dt>{t.has(`spec.${spec.key}`) ? t(`spec.${spec.key}`) : spec.key}</dt>
                <dd>
                  {spec.value}
                  {spec.unit === undefined ? "" : ` ${spec.unit}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {product.warrantyMonths === undefined ? null : (
        <p className="pdp-warranty">{t("warranty", { months: product.warrantyMonths })}</p>
      )}

      <section className="pdp-lead" aria-label={t("leadTitle")}>
        <LeadForm
          region={region}
          productId={product.id}
          sourcePath={`/${region}/robots/${product.slug}`}
          sportInterest={product.sports[0]}
          labels={{
            title: t("leadTitle"),
            name: t("leadName"),
            email: t("leadEmail"),
            message: t("leadMessage"),
            consent: t("leadConsent"),
            submit: t("leadSubmit"),
            invalid: t("leadInvalid"),
          }}
        />
      </section>
    </main>
  );
}

function pickLower(a: Money | null, b: Money | null): Money | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.amount < a.amount ? b : a;
}
