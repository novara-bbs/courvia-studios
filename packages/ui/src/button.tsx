import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "ghost";
  children: ReactNode;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
  const classes = ["cv-btn", `cv-btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}
