import type { ReactNode } from "react";

export interface ButtonProps {
  variant?: "primary" | "ghost";
  /** Submit is needed for server-action forms; default stays "button". */
  type?: "button" | "submit";
  name?: string;
  value?: string;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Deliberately not `ComponentPropsWithoutRef<"button">`: spreading the full
 * DOM prop set let `className`, `style` and `onClick` through — the first two
 * break the design-system guardrail, and the third typechecks on a server
 * component that can never handle it.
 */
export function Button({
  variant = "primary",
  type = "button",
  name,
  value,
  disabled,
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      className={`cv-btn cv-btn--${variant}`}
    >
      {children}
    </button>
  );
}
