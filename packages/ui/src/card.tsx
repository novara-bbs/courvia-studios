import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface CardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  const classes = ["cv-card", className].filter(Boolean).join(" ");
  return (
    <div {...rest} className={classes}>
      {children}
    </div>
  );
}
