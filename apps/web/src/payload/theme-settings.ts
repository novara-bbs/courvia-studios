import { DEFAULT_THEME, THEME_ALIAS_LIST } from "@courvia/design-tokens";
import type { GlobalConfig } from "payload";

import { revalidateTag } from "next/cache";

import { anyone, hiddenUnlessAdmin, isAdmin } from "./access";
import { previewRegion, previewUrl } from "./preview";

/**
 * Site-wide theme (ADR-015): the active theme is CMS content, cached and
 * tag-invalidated by the frontend — never a visitor cookie. Token overrides
 * (the Zod-validated whitelist of ADR-011) arrive in their own task.
 */
export const ThemeSettings: GlobalConfig = {
  slug: "theme-settings",
  label: "Tema",
  admin: {
    // Only an admin may save this global; an editor was still shown the form.
    hidden: hiddenUnlessAdmin,
    /**
     * The one control that re-skins the entire site had no way to look at
     * the site. This is the plain Preview button, not the live-preview
     * iframe, and the difference is honesty: this global has no drafts
     * (globals need a versions table to have any, i.e. a migration), so it
     * saves straight to live and the only truthful thing to show is what is
     * saved. Opening it through `/next/preview` means draft pages render
     * too, so an editor can check a new theme against work in progress.
     */
    description:
      "Abre «Vista previa» para ver el sitio con lo ÚLTIMO GUARDADO: estos ajustes no tienen borrador, se publican al guardar.",
    preview: (_data, { locale }) => previewUrl(`/${previewRegion(locale)}`),
  },
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
