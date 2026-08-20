/**
 * Header/footer links from the Navigation global, cached under
 * cacheTag("navigation") — the global's afterChange hook revalidates it, so
 * editing the menu in the admin updates every page without a deploy.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { isDatabaselessBuild } from "../server/build-env";

export interface NavLink {
  label: string;
  href: string;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export interface Navigation {
  header: NavLink[];
  headerCta: NavLink | null;
  footerGroups: NavGroup[];
  footer: NavLink[];
}

const EMPTY: Navigation = { header: [], headerCta: null, footerGroups: [], footer: [] };

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
    })) as {
      header?: NavLink[] | null;
      headerCta?: { label?: string | null; href?: string | null } | null;
      footerGroups?: Array<{ label: string; links?: NavLink[] | null }> | null;
      footer?: NavLink[] | null;
    };
    const cta = global.headerCta;
    return {
      header: global.header ?? [],
      headerCta:
        cta?.label && cta?.href ? { label: cta.label, href: cta.href } : null,
      footerGroups: (global.footerGroups ?? []).map((group) => ({
        label: group.label,
        links: group.links ?? [],
      })),
      footer: global.footer ?? [],
    };
  } catch (error) {
    console.error("navigation read failed", error);
    if (isDatabaselessBuild("the site navigation", error)) return EMPTY;
    throw error;
  }
}
