import "@courvia/design-tokens/tokens.css";
import "@courvia/ui/styles.css";
import "./app.css";

import { DEFAULT_THEME, THEME_ALIASES } from "@courvia/design-tokens";
import type { ThemeAlias } from "@courvia/design-tokens";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { fontVariableClasses } from "./fonts";

export const metadata: Metadata = {
  title: "Courvia",
  description:
    "Entrenamiento para deportes de raqueta: robots lanzapelotas, equipamiento y academy.",
};

function isThemeAlias(value: string | undefined): value is ThemeAlias {
  // Object.hasOwn, not `in`: `in` would accept Object.prototype keys
  // ("toString", …) and stamp garbage into the DOM.
  return value !== undefined && Object.hasOwn(THEME_ALIASES, value);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theme resolved on the server and stamped on <html> before first paint —
  // no FOUC (CLAUDE.md §5). `dir` is fixed server-side too; it becomes
  // locale-driven when i18n lands (§9).
  const cookieTheme = (await cookies()).get("cv-theme")?.value;
  const theme: ThemeAlias = isThemeAlias(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <html lang="es" dir="ltr" data-theme={theme} className={fontVariableClasses}>
      <body>{children}</body>
    </html>
  );
}
