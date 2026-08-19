/**
 * Site-wide theme, resolved from the ThemeSettings global (ADR-015).
 *
 * Cached with cacheTag("theme"): publishing in /admin fires the global's
 * afterChange hook, which revalidates the tag — the whole site re-skins on
 * publish, and nothing is per-request. The visitor cookie is gone; theme is
 * a brand decision made in the panel, not a preference.
 */
import config from "@payload-config";
import { DEFAULT_THEME, isThemeAlias } from "@courvia/design-tokens";
import type { ThemeAlias } from "@courvia/design-tokens";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

export async function getSiteTheme(): Promise<ThemeAlias> {
  "use cache";
  cacheLife("max");
  cacheTag("theme");
  try {
    const payload = await getPayload({ config });
    const settings = await payload.findGlobal({ slug: "theme-settings", depth: 0 });
    return isThemeAlias(settings.activeTheme) ? settings.activeTheme : DEFAULT_THEME;
  } catch {
    // Build environments without a database (CI) prerender with the compiled
    // default; the first runtime revalidation replaces it.
    return DEFAULT_THEME;
  }
}
