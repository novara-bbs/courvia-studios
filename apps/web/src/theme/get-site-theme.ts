/**
 * Site-wide theme, resolved from the ThemeSettings global (ADR-015).
 *
 * Cached with cacheTag("theme"). Publishing in /admin marks the tag stale;
 * each route serves AT MOST ONE more view in the old theme while the shell
 * regenerates in the background (stale-while-revalidate) — reload twice to
 * verify a publish. The visitor cookie is gone; theme is a brand decision.
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
  } catch (error) {
    // Build environments without a database (CI) prerender with the compiled
    // default. At RUNTIME we rethrow instead: returning the default here
    // would cache the WRONG theme under cacheLife("max") — a transient DB
    // blip during a background revalidation would pin the site to volt for
    // up to a month, while a thrown error leaves the correct stale entry
    // in place.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return DEFAULT_THEME;
    }
    console.error("theme-settings read failed", error);
    throw error;
  }
}
