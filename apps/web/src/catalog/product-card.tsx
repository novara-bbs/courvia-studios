/**
 * The one product card: catalog listing, category pages and the CMS
 * productShowcase block all render THIS component, so price display,
 * launch-status badges and image treatment can never drift between surfaces.
 */
import { format } from "@courvia/commerce-domain";
import type { ProductSummary } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function ProductCard({
  robot,
  region,
  headingLevel = "h2",
}: {
  robot: ProductSummary;
  region: RegionId;
  /** h2 on listing pages, h3 inside CMS sections that carry their own h2. */
  headingLevel?: "h2" | "h3";
}) {
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "catalog" });
  const Heading = headingLevel;
  const status = robot.launchStatus ?? "available";

  return (
    <Link className="catalog-card" href={`/${region}/robots/${robot.slug}`}>
      {robot.image === undefined ? null : (
        <span className="catalog-card-media">
          <Image
            src={robot.image.url}
            alt={robot.image.alt}
            width={robot.image.width ?? 860}
            height={robot.image.height ?? 645}
            sizes="(max-width: 680px) 100vw, 320px"
          />
        </span>
      )}
      <Heading>{robot.title}</Heading>
      {status === "available" ? null : (
        <p className="catalog-card-status">{t(`status.${status}`)}</p>
      )}
      {robot.excerpt === undefined ? null : <p>{robot.excerpt}</p>}
      <p className="catalog-card-meta">
        <span className="catalog-sports">
          {robot.sports.map((sport) => t(`sport.${sport}`)).join(" · ")}
        </span>
        {/* A waitlist product shows no price: capturing interest, not selling. */}
        {robot.fromPrice === null || status === "waitlist" ? null : (
          <strong>{t("fromPrice", { price: format(robot.fromPrice, def.hreflang) })}</strong>
        )}
      </p>
    </Link>
  );
}
