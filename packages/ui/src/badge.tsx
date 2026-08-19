import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  variant?: "default" | "accent";
  children: ReactNode;
}

export function Badge({ variant = "default", className, children, ...rest }: BadgeProps) {
  const classes = [
    "cv-badge",
    variant === "accent" ? "cv-badge--accent" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span {...rest} className={classes}>
      {children}
    </span>
  );
}
