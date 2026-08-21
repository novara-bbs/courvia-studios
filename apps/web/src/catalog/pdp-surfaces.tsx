/**
 * The seven surfaces of a product page, and the subject that describes them.
 *
 * WHAT MOVED HERE AND WHY. Until WP13 this markup was the body of
 * `app/(frontend)/[region]/robots/[slug]/page.tsx`: one route, one hard-coded
 * order, nothing an editor could touch. It is now placed by a TEMPLATE, and
 * the bound sections of `@courvia/sections` decide where each piece goes and
 * whether it goes at all. What they cannot do is draw it — three of these
 * seven need something a section may not import:
 *
 *   - the gallery needs `next/image` (a plain <img> would ship the 1600px
 *     master to a 390px phone, and the srcset here is Next's, not ours),
 *   - the form is a client component wired to a server action,
 *   - the range and the form both read the catalogue.
 *
 * So the app keeps the markup and the sections keep the composition. That is
 * the same split `renderProductGrid` / `renderSpecTable` already use for the
 * commerce blocks; this is it with a subject instead of an editor's picks.
 *
 * THE MARKUP IS DELIBERATELY UNCHANGED — every element, class, attribute and
 * order is the one the route emitted, down to the explicit space before an
 * evidence chip. `pdp-template.test.ts` compares the rendered page against
 * the one this replaced, so any "improvement" made in passing would show up
 * there as a difference, which is exactly what it is.
 */
import { format, type Money } from "@courvia/commerce-domain";
import type { ProductDetail, ProductSummary } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import type { ProductSubject, ProductSurface } from "@courvia/sections/registry";
import { LinkButton } from "@courvia/ui";
import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { ProductCard } from "./product-card";
import { LeadForm } from "../leads/lead-form";

/**
 * Where the buy rail's single action lands, and the id of the form.
 *
 * One constant for both halves, and it stays in the app rather than moving
 * into the sections package with the rest of WP13: the rail and the form are
 * two surfaces of the SAME page, drawn by the same file, and an anchor that
 * two packages had to agree on would be an anchor that could disagree.
 */
export const LEAD_ANCHOR = "lista-espera";

/** What a lead from this page is asking for, from the product's own state. */
function intentOf(status: ProductSubject["status"]): "demo" | "waitlist" | "preorder" {
  return status === "available" ? "demo" : status;
}

/**
 * The product as a bound section sees it: facts, not markup.
 *
 * Every number here is a branch — `SectionRenderer` drops a section's
 * wrapper when its render returns null, and the wrapper carries the
 * background and the block rhythm, so a band with nothing in it is a visible
 * blank stripe. A section can only avoid that if it knows, before
 * delegating, that there is nothing to delegate.
 */
export function productSubjectOf(
  detail: ProductDetail,
  region: RegionId,
  related: ProductSummary[],
): ProductSubject {
  const { product, variants } = detail;
  return {
    kind: "product",
    slug: product.slug,
    market: REGION_DEFINITIONS[region].market,
    status: product.launchStatus ?? "available",
    skus: variants.map((offer) => offer.sku),
    imageCount: product.images?.length ?? 0,
    specCount: product.specs.length,
    hasDescription: product.description !== undefined && product.description !== null,
    relatedSlugs: related.map((other) => other.slug),
  };
}

/**
 * The renderer the render context injects: one surface at a time, by name.
 *
 * Async because it needs the catalogue namespace; everything else it needs
 * the route has already fetched, so a template with five bound sections
 * costs the same queries the hand-written page did.
 */
export async function makeProductSurfaces({
  detail,
  region,
  related,
  renderRichText,
}: {
  detail: ProductDetail;
  region: RegionId;
  related: ProductSummary[];
  renderRichText: (value: unknown) => ReactNode;
}): Promise<(surface: ProductSurface) => ReactNode> {
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "catalog" });
  const { product, variants } = detail;
  // waitlist = capturing interest, not selling: no price, no stock table.
  const status = product.launchStatus ?? "available";
  const fromPrice = variants.reduce<Money | null>(
    (lowest, offer) => pickLower(lowest, offer.price),
    null,
  );
  // The rail's action and the form's heading say the same words on purpose:
  // the jump lands on the sentence the button just promised.
  const askLabel =
    status === "waitlist"
      ? t("waitlistTitle")
      : status === "preorder"
        ? t("preorderTitle")
        : t("leadTitle");

  const rail = (
    /* The buy rail: who this is, what state it is in, and ONE action. It
       comes first in the document so a phone reads the title and the CTA
       before the 1075px hero; on desktop the grid puts it back beside the
       media and pins it (see .pdp-hero in app.css). The form itself stays
       full width below — a rail with a whole form in it is not a rail.
       Two elements, like Dawn's info-wrapper/column-sticky: the outer one
       is the grid cell, the inner one is what sticks. */
    <div className="pdp-rail">
      <div className="pdp-rail-sticky">
        <header className="pdp-head">
          <p className="eyebrow">
            {[product.brand?.name, product.sports.map((sport) => t(`sport.${sport}`)).join(" · ")]
              .filter(Boolean)
              .join(" — ")}
          </p>
          <h1>{product.title}</h1>
          {status === "available" ? null : <p className="pdp-status">{t(`status.${status}`)}</p>}
          {product.excerpt === undefined ? null : <p className="lead">{product.excerpt}</p>}
          {fromPrice === null || status === "waitlist" ? null : (
            <p className="pdp-price">{t("fromPrice", { price: format(fromPrice, def.hreflang) })}</p>
          )}
        </header>
        {product.warrantyMonths === undefined ? null : (
          <p className="pdp-warranty">{t("warranty", { months: product.warrantyMonths })}</p>
        )}
        <LinkButton href={`#${LEAD_ANCHOR}`}>{askLabel}</LinkButton>
      </div>
    </div>
  );

  const gallery =
    product.images === undefined || product.images.length === 0 ? null : (
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
            {image.concept === true ? <span className="pdp-concept">{t("conceptRender")}</span> : null}
            {image.caption === undefined ? null : <figcaption>{image.caption}</figcaption>}
          </figure>
        ))}
      </section>
    );

  const variantsTable =
    status === "waitlist" ? null : (
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
    );

  const description =
    product.description === undefined || product.description === null ? null : (
      <section className="pdp-description cv-prose">{renderRichText(product.description)}</section>
    );

  const specs =
    product.specs.length === 0 ? null : (
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
                  <>
                    {/* An explicit space: without it the value and the chip
                        are one word for line breaking, for a screen reader
                        and for copy/paste. */}
                    {" "}
                    <span className="spec-evidence">{t(`evidence.${spec.evidence}`)}</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {product.specs.some((spec) => spec.evidence !== undefined && spec.evidence !== "published") ? (
          <p className="evidence-note">{t("evidenceNote")}</p>
        ) : null}
      </section>
    );

  const lead = (
    <section className="pdp-lead" id={LEAD_ANCHOR} aria-label={t("leadTitle")}>
      <LeadForm
        region={region}
        intent={intentOf(status)}
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
          title: askLabel,
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
  );

  const range =
    related.length === 0 ? null : (
      // Dawn closes a PDP with product-recommendations; without it <main>
      // held exactly one link (the privacy policy) and the page was a
      // dead end for anyone the rail did not convince.
      <section className="pdp-related" aria-labelledby="pdp-related-title">
        <h2 id="pdp-related-title">{t("relatedTitle")}</h2>
        <ul className="catalog-grid">
          {related.map((other) => (
            <li key={other.id}>
              <ProductCard robot={other} region={region} headingLevel="h3" />
            </li>
          ))}
        </ul>
      </section>
    );

  const surfaces: Record<ProductSurface, ReactNode> = {
    rail,
    gallery,
    variants: variantsTable,
    description,
    specs,
    lead,
    range,
  };
  return (surface) => surfaces[surface];
}

function pickLower(a: Money | null, b: Money | null): Money | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.amount < a.amount ? b : a;
}
