/**
 * Header/footer links from the Navigation global, cached under
 * cacheTag("navigation") — the global's afterChange hook revalidates it, so
 * editing the menu in the admin updates every page without a deploy.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

export interface NavLink {
  label: string;
  href: string;
}

export interface Navigation {
  header: NavLink[];
  footer: NavLink[];
}

export async function getNavigation(locale: LocaleId): Promise<Navigation> {
  "use cache";
  cacheLife("max");
  cacheTag("navigation");
  try {
    const payload = await getPayload({ config });
    const global = (await payload.findGlobal({
      slug: "navigation",
      locale,
      depth: 0,
      overrideAccess: true,
    })) as { header?: NavLink[] | null; footer?: NavLink[] | null };
    return { header: global.header ?? [], footer: global.footer ?? [] };
  } catch (error) {
    console.error("navigation read failed", error);
    if (
      process.env.NEXT_PHASE === "phase-production-build" &&
      (process.env.DATABASE_URL ?? "") === ""
    ) {
      return { header: [], footer: [] };
    }
    throw error;
  }
}
