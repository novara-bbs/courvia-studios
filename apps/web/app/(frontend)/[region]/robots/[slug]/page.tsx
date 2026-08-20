import { format, type Money } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getRobot } from "../../../../../src/catalog/get-catalog";
import { makeRenderContext } from "../../../../../src/content/render-context";
import { setRequestRegion } from "../../../../../src/i18n/request-region";
import { LeadForm } from "../../../../../src/leads/lead-form";
import { ProductJsonLd } from "../../../../../src/seo/product-json-ld";
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
  const ctx = makeRenderContext(false, region);
  // waitlist = capturing interest, not selling: no price, no stock table.
  const status = product.launchStatus ?? "available";
  const fromPrice = variants.reduce<Money | null>(
    (lowest, offer) => pickLower(lowest, offer.price),
    null,
  );

  return (
    <main className="page">
      <header className="pdp-head">
        <p className="eyebrow">
          {[
            product.brand?.name,
            product.sports.map((sport) => t(`sport.${sport}`)).join(" · "),
          ]
            .filter(Boolean)
            .join(" — ")}
        </p>
        <h1>{product.title}</h1>
        {status === "available" ? null : (
          <p className="pdp-status">{t(`status.${status}`)}</p>
        )}
        {product.excerpt === undefined ? null : <p className="lead">{product.excerpt}</p>}
        {fromPrice === null || status === "waitlist" ? null : (
          <p className="pdp-price">{t("fromPrice", { price: format(fromPrice, def.hreflang) })}</p>
        )}
      </header>

      {product.images === undefined || product.images.length === 0 ? null : (
        // Canonical gallery (brand book §26): hero first and full-width, the
        // rest in a two-up grid; every non-photographic asset carries the
        // "render conceptual" label the evidence register mandates (E-028).
        <section className="pdp-gallery" aria-label={t("galleryTitle")}>
          {product.images.map((image, index) => (
            <figure key={image.url} className="pdp-media">
              <Image
                src={image.url}
                alt={image.alt}
                width={image.width ?? 1600}
                height={image.height ?? 1200}
                sizes={
                  index === 0 ? "(max-width: 860px) 100vw, 860px" : "(max-width: 860px) 100vw, 430px"
                }
                priority={index === 0}
              />
              {image.concept === true ? (
                <span className="pdp-concept">{t("conceptRender")}</span>
              ) : null}
              {image.caption === undefined ? null : <figcaption>{image.caption}</figcaption>}
            </figure>
          ))}
        </section>
      )}

      {status === "waitlist" ? null : (
      <section className="pdp-variants" aria-labelledby="pdp-variants-title">
        <h2 id="pdp-variants-title">{t("variantsTitle")}</h2>
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">{t("variantsTitle")}</caption>
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
                    {offer.price === null ? (
                      // Not sold in this market: stock is irrelevant, and
                      // showing "in stock" for an unbuyable variant misleads.
                      <span className="stock stock--out">{t("notSoldHere")}</span>
                    ) : offer.available > 0 ? (
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
      )}

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
                <dt>{spec.label}</dt>
                <dd>
                  {spec.value}
                  {spec.unit === undefined ? "" : ` ${spec.unit}`}
                  {spec.evidence === undefined || spec.evidence === "published" ? null : (
                    <span className="spec-evidence">{t(`evidence.${spec.evidence}`)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {product.specs.some((spec) => spec.evidence !== undefined && spec.evidence !== "published") ? (
            <p className="pdp-evidence-note">{t("evidenceNote")}</p>
          ) : null}
        </section>
      )}

      {product.warrantyMonths === undefined ? null : (
        <p className="pdp-warranty">{t("warranty", { months: product.warrantyMonths })}</p>
      )}

      <section className="pdp-lead" aria-label={t("leadTitle")}>
        <LeadForm
          region={region}
          intent={status === "available" ? "demo" : status}
          productId={product.id}
          sourcePath={`/${region}/robots/${product.slug}`}
          privacyHref={`/${region}/privacidad`}
          variants={
            status === "waitlist"
              ? undefined
              : variants
                  .filter((offer) => offer.price !== null)
                  .map((offer) => ({
                    sku: offer.sku,
                    label: `${offer.sku} · ${t(`sport.${offer.sport}`)}`,
                  }))
          }
          labels={{
            title:
              status === "waitlist"
                ? t("waitlistTitle")
                : status === "preorder"
                  ? t("preorderTitle")
                  : t("leadTitle"),
            name: t("leadName"),
            email: t("leadEmail"),
            message: t("leadMessage"),
            consent: t("leadConsent"),
            privacy: t("leadPrivacy"),
            submit:
              status === "waitlist"
                ? t("waitlistSubmit")
                : status === "preorder"
                  ? t("preorderSubmit")
                  : t("leadSubmit"),
            invalid: t("leadInvalid"),
            throttled: t("leadThrottled"),
            variant: t("leadVariant"),
            variantAny: t("leadVariantAny"),
          }}
        />
      </section>

      <ProductJsonLd detail={detail} region={region} />
    </main>
  );
}

function pickLower(a: Money | null, b: Money | null): Money | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.amount < a.amount ? b : a;
}
