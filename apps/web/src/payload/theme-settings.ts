import { DEFAULT_THEME, THEME_ALIAS_LIST } from "@courvia/design-tokens";
import type { GlobalConfig } from "payload";

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
