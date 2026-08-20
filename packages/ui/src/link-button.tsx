import type { ReactNode } from "react";

export interface LinkButtonProps {
  variant?: "primary" | "ghost";
  href: string;
  hrefLang?: string;
  children: ReactNode;
}

/**
 * A navigation styled as a button — for CTAs that GO somewhere ("Reservar" →
 * the catalog), where a <button> would be a lie to crawlers and keyboards.
 * Same closed prop set as Button: no className/style passthrough. A plain
 * <a> keeps this package framework-free; these are above-the-fold CTAs where
 * a full navigation is fine.
 */
export function LinkButton({ variant = "primary", href, hrefLang, children }: LinkButtonProps) {
  return (
    <a href={href} hrefLang={hrefLang} className={`cv-btn cv-btn--${variant}`}>
      {children}
    </a>
  );
}
