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
  label: { es: "Tema", en: "Theme", ar: "السمة" },
  /**
   * ---------------------------------------------------------------------
   * History, and deliberately NOT drafts.
   * ---------------------------------------------------------------------
   *
   * Until now this global had neither: saving re-skinned the whole site with
   * nothing to go back to. `versions` gives it `_theme_settings_v`, a
   * snapshot per save and the panel's Versions tab, where any earlier
   * revision can be restored. That is the undo the control was missing.
   *
   * `drafts` stays off, and the reason is a boundary rather than an
   * oversight. With drafts on, a draft save writes ONLY the versions table
   * (payload/dist/globals/operations/update.js: the `payload.db.updateGlobal`
   * call sits inside `if (!isSavingDraft)`), so the storefront would keep
   * serving the published row — correct — but `getSiteTheme()` and
   * `getNavigation()` read the published row unconditionally, so PREVIEW
   * would keep showing the old theme too. A draft you cannot preview is a
   * worse promise than no draft, and closing that gap means editing
   * `src/theme/get-site-theme.ts` and `src/chrome/get-navigation.ts`, which
   * belongs to the task that turns preview draft-aware, not to this one.
   *
   * 30 revisions: enough to walk back a bad week of theme experiments,
   * bounded so the table cannot grow without limit.
   */
  versions: { drafts: false, max: 30 },
  admin: {
    // Only an admin may save this global; an editor was still shown the form.
    hidden: hiddenUnlessAdmin,
    /**
     * The one control that re-skins the entire site had no way to look at
     * the site. This is the plain Preview button, not the live-preview
     * iframe, and the difference is honesty: saving still publishes, so the
     * only truthful thing to show is what is saved. Opening it through
     * `/next/preview` means draft pages render too, so an editor can check a
     * new theme against work in progress.
     */
    description: {
      es: "Abre «Vista previa» para ver el sitio con lo ÚLTIMO GUARDADO: estos ajustes no tienen borrador, se publican al guardar. Cada guardado deja una versión: se puede volver atrás desde «Versiones».",
      en: "Open Preview to see the site as LAST SAVED: these settings have no draft, saving publishes them. Every save leaves a version, so any earlier one can be restored from Versions.",
      ar: "افتح «معاينة» لرؤية الموقع بآخر ما حُفظ: لا توجد مسودة لهذه الإعدادات، فالحفظ ينشرها. كل حفظ يترك نسخة، ويمكن الرجوع إلى أي نسخة سابقة من «النسخ».",
    },
    preview: (_data, { locale }) => previewUrl(`/${previewRegion(locale)}`),
  },
  access: {
    read: anyone,
    update: isAdmin,
    // Reading history and restoring a revision are the same act as reading
    // and saving the global, so they answer to the same two predicates.
    readVersions: isAdmin,
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
      label: { es: "Tema activo", en: "Active theme", ar: "السمة الفعّالة" },
      required: true,
      defaultValue: DEFAULT_THEME,
      // The VALUES are the contract (`data-theme` in the served HTML) and
      // the aliases are already language-neutral proper nouns, so there is
      // nothing here to translate — only the field around them.
      options: THEME_ALIAS_LIST.map((alias) => ({ label: alias, value: alias })),
      admin: {
        description: {
          es: "Re-viste el sitio entero al publicar. Las páginas y secciones pueden declarar su propio tema por encima.",
          en: "Re-skins the whole site on save. Pages and sections may declare their own theme on top of it.",
          ar: "يعيد كساء الموقع بالكامل عند الحفظ. يمكن للصفحات والأقسام أن تعلن سمتها الخاصة فوقه.",
        },
      },
    },
  ],
};
