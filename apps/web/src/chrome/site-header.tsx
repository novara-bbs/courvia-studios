import type { RegionId } from "@courvia/platform";
import { REGION_DEFINITIONS } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getNavigation } from "./get-navigation";

export async function SiteHeader({ region }: { region: RegionId }) {
  const def = REGION_DEFINITIONS[region];
  const [nav, t] = await Promise.all([
    getNavigation(def.locale),
    getTranslations({ locale: def.locale, namespace: "nav" }),
  ]);

  return (
    <header className="site-header">
      <a className="skip-link" href="#contenido">
        {t("skipToContent")}
      </a>
      <div className="site-header-inner">
        <Link className="wordmark" href={`/${region}`} aria-label="Courvia">
          COURVIA<span className="wordmark-ball" aria-hidden="true" />
        </Link>
        {nav.header.length === 0 ? null : (
          <nav aria-label={t("mainNav")}>
            <ul className="site-nav">
              {nav.header.map((link) => (
                <li key={link.href}>
                  <Link href={`/${region}${link.href === "/" ? "" : link.href}`}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {nav.headerCta === null ? null : (
          <Link className="site-header-cta" href={`/${region}${nav.headerCta.href}`}>
            {nav.headerCta.label}
          </Link>
        )}
      </div>
    </header>
  );
}
