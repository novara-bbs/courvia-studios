import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { Badge, Card, LinkButton } from "@courvia/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { regionAlternates } from "../../../src/seo/region-alternates";

type PageArgs = { params: Promise<{ region: string }> };

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  return { alternates: regionAlternates(region, "") };
}

export default async function HomePage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  const { locale } = REGION_DEFINITIONS[region];

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
