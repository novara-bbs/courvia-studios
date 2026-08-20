import type { RegionId } from "@courvia/platform";
import { REGION_DEFINITIONS } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getNavigation } from "./get-navigation";
import { RegionSelector } from "./region-selector";

export async function SiteFooter({ region }: { region: RegionId }) {
  const def = REGION_DEFINITIONS[region];
  const [nav, t, tNav] = await Promise.all([
    getNavigation(def.locale),
    getTranslations({ locale: def.locale, namespace: "footer" }),
    getTranslations({ locale: def.locale, namespace: "nav" }),
  ]);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-tagline">{t("tagline")}</p>
        {nav.footer.length === 0 ? null : (
          <ul className="site-footer-links">
            {nav.footer.map((link) => (
              <li key={link.href}>
                <Link href={`/${region}${link.href === "/" ? "" : link.href}`}>{link.label}</Link>
              </li>
            ))}
          </ul>
        )}
        <RegionSelector current={region} label={tNav("regionSelector")} />
      </div>
    </footer>
  );
}
