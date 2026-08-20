import type { RegionId } from "@courvia/platform";
import { REGION_DEFINITIONS } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getNavigation } from "./get-navigation";
import { RegionSelector } from "./region-selector";

/**
 * The store-canon footer (3-5 intent columns over a legal bottom row): the
 * columns and their links live in the Navigation global, so marketing
 * reorganizes them without a deploy.
 */
export async function SiteFooter({ region }: { region: RegionId }) {
  const def = REGION_DEFINITIONS[region];
  const [nav, t, tNav] = await Promise.all([
    getNavigation(def.locale),
    getTranslations({ locale: def.locale, namespace: "footer" }),
    getTranslations({ locale: def.locale, namespace: "nav" }),
  ]);
  const href = (path: string) => `/${region}${path === "/" ? "" : path}`;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <p className="site-footer-wordmark" aria-hidden="true">
              COURVIA<span className="wordmark-ball" />
            </p>
            <p className="site-footer-tagline">{t("tagline")}</p>
          </div>
          {nav.footerGroups.length === 0 ? null : (
            <div className="site-footer-columns">
              {nav.footerGroups.map((group) => (
                <nav key={group.label} aria-label={group.label} className="site-footer-column">
                  <h2>{group.label}</h2>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link href={href(link.href)}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          )}
        </div>
        <div className="site-footer-bottom">
          <p className="site-footer-copyright">{t("copyright")}</p>
          {nav.footer.length === 0 ? null : (
            <ul className="site-footer-links">
              {nav.footer.map((link) => (
                <li key={link.href}>
                  <Link href={href(link.href)}>{link.label}</Link>
                </li>
              ))}
            </ul>
          )}
          <RegionSelector current={region} label={tNav("regionSelector")} />
        </div>
      </div>
    </footer>
  );
}
