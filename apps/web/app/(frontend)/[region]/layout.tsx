import "@courvia/design-tokens/tokens.css";
import "@courvia/ui/styles.css";
import "../app.css";

import { REGIONS, REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { OrganizationJsonLd } from "../../../src/seo/organization-json-ld";
import { getSiteTheme } from "../../../src/theme/get-site-theme";
import { fontClassesFor } from "../fonts";

type LayoutArgs = {
  children: ReactNode;
  params: Promise<{ region: string }>;
};

export function generateStaticParams() {
  return REGIONS.map((region) => ({ region }));
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "meta" });

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: "%s · Courvia" },
    description: t("description"),
    alternates: {
      canonical: `/${region}`,
      languages: {
        ...Object.fromEntries(
          Object.values(REGION_DEFINITIONS).map((r) => [r.hreflang, `/${r.id}`]),
        ),
        "x-default": "/es",
      },
    },
  };
}

export default async function RegionLayout({ children, params }: LayoutArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();

  const def = REGION_DEFINITIONS[region];
  // Theme comes from the CMS (ADR-015): cached under cacheTag("theme"),
  // revalidated when ThemeSettings publishes. No cookie, no per-request work.
  const theme = await getSiteTheme();

  return (
    <html
      lang={def.locale}
      dir={def.dir}
      data-theme={theme}
      className={fontClassesFor(theme, def.locale)}
    >
      <body>
        {children}
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
