import type { ReactNode } from "react";

export interface BadgeProps {
  variant?: "default" | "accent";
  children: ReactNode;
}

/**
 * No `className` or `style` prop by design (ADR-16): the moment a primitive
 * forwards arbitrary classes, CMS content can inject styling and the
 * token-bound guardrail becomes advisory. Visual variation arrives through
 * declared variants and the section-level appearance controls.
 */
export function Badge({ variant = "default", children }: BadgeProps) {
  return (
    <span className={variant === "accent" ? "cv-badge cv-badge--accent" : "cv-badge"}>
      {children}
    </span>
  );
}
