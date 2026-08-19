import type { ReactNode } from "react";

export interface CardProps {
  /** Surface role this card sits on; bound to semantic tokens, not colours. */
  surface?: "surface" | "raised";
  children: ReactNode;
}

export function Card({ surface = "surface", children }: CardProps) {
  return <div className={`cv-card cv-card--${surface}`}>{children}</div>;
}
