import type { RegionId } from "@courvia/platform";
import { REGION_DEFINITIONS } from "@courvia/platform";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CartBadge } from "../cart/cart-badge";
import { getNavigation } from "./get-navigation";
import { MobileMenu } from "./mobile-menu";

export async function SiteHeader({ region }: { region: RegionId }) {
  const def = REGION_DEFINITIONS[region];
  const [nav, t, tCart] = await Promise.all([
    getNavigation(def.locale),
    getTranslations({ locale: def.locale, namespace: "nav" }),
    getTranslations({ locale: def.locale, namespace: "cart" }),
  ]);
  // One list of hrefs for both renderings of the nav: the bar below
  // --cv-breakpoint-md and the disclosure above it show the same links, and
  // CSS decides which one exists at a given width.
  const links = nav.header.map((link) => ({
    href: `/${region}${link.href === "/" ? "" : link.href}`,
    label: link.label,
  }));

  return (
    <header className="site-header">
      <a className="skip-link" href="#contenido">
        {t("skipToContent")}
      </a>
      <div className="site-header-inner">
        <Link className="wordmark" href={`/${region}`} aria-label="Courvia">
          COURVIA<span className="wordmark-ball" aria-hidden="true" />
        </Link>
        {links.length === 0 ? null : (
          <nav className="site-nav-desktop" aria-label={t("mainNav")}>
            <ul className="site-nav">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
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
        {/* El contador se pinta en cliente desde una cookie legible. Leer la
            sesión aquí volvería dinámicas TODAS las rutas de `/[region]`
            —la cabecera está en su layout— y un contador no vale una caché.
            El porqué completo está en `src/cart/session.ts`. */}
        <CartBadge
          href={`/${region}/carrito`}
          label={tCart("badge")}
          unitsLabel={tCart("badgeUnits")}
        />
        {links.length === 0 ? null : (
          <MobileMenu
            links={links}
            labels={{ nav: t("mainNav"), open: t("openMenu"), close: t("closeMenu") }}
          />
        )}
      </div>
    </header>
  );
}
