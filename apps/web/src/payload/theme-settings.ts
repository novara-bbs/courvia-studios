import { DEFAULT_THEME, THEME_ALIAS_LIST } from "@courvia/design-tokens";
import type { GlobalConfig } from "payload";

import { revalidateTag } from "next/cache";

import { anyone, isAdmin } from "./access";

/**
 * Site-wide theme (ADR-015): the active theme is CMS content, cached and
 * tag-invalidated by the frontend — never a visitor cookie. Token overrides
 * (the Zod-validated whitelist of ADR-011) arrive in their own task.
 */
export const ThemeSettings: GlobalConfig = {
  slug: "theme-settings",
  label: "Tema",
  access: {
    read: anyone,
    update: isAdmin,
  },
  hooks: {
    afterChange: [
      // Marks the theme cache stale (SWR): each route serves at most one
      // more view in the old theme while its shell regenerates. Reload twice
      // when verifying a publish.
      () => {
        try {
          revalidateTag("theme", "max");
        } catch {
          // Outside the Next runtime (payload CLI, seed scripts) there is no
          // cache to revalidate — that is fine.
        }
      },
    ],
  },
  fields: [
    {
      name: "activeTheme",
      type: "select",
      required: true,
      defaultValue: DEFAULT_THEME,
      options: THEME_ALIAS_LIST.map((alias) => ({ label: alias, value: alias })),
      admin: {
        description:
          "Re-viste el sitio entero al publicar. Las páginas y secciones pueden declarar su propio tema por encima.",
      },
    },
  ],
};
