"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export interface MobileMenuLink {
  href: string;
  label: string;
}

export interface MobileMenuProps {
  links: readonly MobileMenuLink[];
  cta: MobileMenuLink | null;
  /** Resolved on the server: no visible string lives in this component. */
  labels: { nav: string; open: string; close: string };
}

/**
 * The phone-width navigation: a native <details> disclosure in the bar.
 *
 * Why <details> and not a button with state — the store has to work with the
 * script blocked, and without JS every link here is a full page load, which
 * is exactly what closes the panel again. The one thing the platform cannot
 * do is the case where JS IS running: Next navigates without a new document
 * and `[region]/layout.tsx` survives the transition, so the panel would stay
 * open on top of the page it just opened (measured: `details.open === true`
 * after landing on /es/robots). That single behaviour is all this client
 * component adds — plus Escape, which native <details> does not handle.
 *
 * The links arrive as props so the Payload read stays on the server.
 */
export function MobileMenu({ links, cta, labels }: MobileMenuProps) {
  const panel = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (panel.current !== null) panel.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || panel.current === null || !panel.current.open) return;
      panel.current.open = false;
      panel.current.querySelector("summary")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details className="site-menu" ref={panel}>
      {/* Two hidden labels swapped by CSS on [open] rather than by state:
          the toggle has to name itself correctly with the script blocked
          too, and only the browser knows the state in that case. */}
      <summary className="site-menu-toggle">
        <span className="site-menu-icon" aria-hidden="true" />
        <span className="visually-hidden site-menu-label--open">{labels.open}</span>
        <span className="visually-hidden site-menu-label--close">{labels.close}</span>
      </summary>
      <nav className="site-menu-panel" aria-label={labels.nav}>
        <ul className="site-menu-list">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
        {cta === null ? null : (
          <Link className="site-menu-cta" href={cta.href}>
            {cta.label}
          </Link>
        )}
      </nav>
    </details>
  );
}
