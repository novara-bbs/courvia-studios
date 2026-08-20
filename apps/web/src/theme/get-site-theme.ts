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

import { isDatabaselessBuild } from "../server/build-env";

export async function getSiteTheme(): Promise<ThemeAlias> {
  "use cache";
  cacheLife("max");
  cacheTag("theme");
  try {
    const payload = await getPayload({ config });
    const settings = await payload.findGlobal({ slug: "theme-settings", depth: 0 });
    return isThemeAlias(settings.activeTheme) ? settings.activeTheme : DEFAULT_THEME;
  } catch (error) {
    console.error("theme-settings read failed", error);
    // This used to fall back on ANY build-time failure, database configured
    // or not — which is the one case that had to be excluded. A build that
    // reaches Postgres and gets an error would bake the compiled default
    // over whatever the CMS actually says, under cacheLife("max"): the whole
    // site wearing the wrong brand for up to a month, from a green build.
    //
    // `isDatabaselessBuild` keeps the case that IS correct — a laptop with
    // no database prerendering the compiled default — and turns the other
    // two into what they are: a failure on a deployment build, and a
    // rethrow at runtime, where a thrown error leaves the correct stale
    // entry in place instead of pinning the wrong theme.
    if (isDatabaselessBuild("the site theme", error)) return DEFAULT_THEME;
    throw error;
  }
}
