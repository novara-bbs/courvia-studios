import "@courvia/design-tokens/tokens.css";
import "@courvia/appearance/appearance.css";
import "@courvia/ui/styles.css";
import "@courvia/sections/sections.css";
import "../app.css";

import { REGIONS, REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { setRequestRegion } from "../../../src/i18n/request-region";
import { OrganizationJsonLd } from "../../../src/seo/organization-json-ld";
import { siteUrl } from "../../../src/seo/site-url";
import { getSiteTheme } from "../../../src/theme/get-site-theme";
import { fontClassesFor } from "../fonts";

type LayoutArgs = {
  children: ReactNode;
  params: Promise<{ region: string }>;
};

export function generateStaticParams() {
  return REGIONS.map((region) => ({ region }));
}

// Only origin-level metadata lives here. Canonical and hreflang belong to
// each PAGE (via regionAlternates): defined in a layout they are inherited
// verbatim by every nested route, which would declare the region home as the
// canonical of every deep URL.
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
    metadataBase: new URL(siteUrl()),
    title: { default: t("title"), template: "%s · Courvia" },
    description: t("description"),
  };
}

export default async function RegionLayout({ children, params }: LayoutArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  // Theme comes from the CMS (ADR-015), cached under cacheTag("theme").
  // Publishing marks the tag stale: each route serves AT MOST ONE more view
  // in the old theme while the shell regenerates in the background (SWR).
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
