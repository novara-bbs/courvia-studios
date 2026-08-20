/**
 * Every URL a region serves, plus the ones that moved — as data.
 *
 * The proxy has to answer two questions before a response starts streaming
 * ("did this move?" and "does this exist?"), and it can consult neither
 * Payload nor Postgres: it runs ahead of the app, in its own bundle. So the
 * app publishes the answer as a small JSON document and the proxy reads it
 * over HTTP — the shape Next's own documentation uses for CMS-driven
 * redirects at scale (`node_modules/next/dist/docs/01-app/02-guides/redirecting.md`,
 * "Managing redirects at scale").
 *
 * It is cached under the same tags as the pages and the catalog themselves,
 * so publishing a page or saving a redirect makes it stale at the same
 * instant it makes the page stale. There is no second freshness story.
 */
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { listRobots } from "../catalog/get-catalog";
import { listCategorySlugs } from "../catalog/get-category";
import { listPublishedSlugs } from "../content/get-page";
import { isDatabaselessBuild } from "../server/build-env";
import { REDIRECT_CODES, normalizePath } from "./region-routes";
import type { RedirectCode, RedirectRule, RoutingManifest } from "./region-routes";

function asCode(value: unknown): RedirectCode {
  return REDIRECT_CODES.includes(value as RedirectCode) ? (value as RedirectCode) : "301";
}

/** Every redirect rule, normalized. Server-side read: the collection's own
 *  access rules are about the admin panel, not about this. */
async function listRedirects(): Promise<RedirectRule[]> {
  "use cache";
  cacheLife("max");
  cacheTag("redirects");
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "redirects",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      select: { from: true, to: true, code: true },
    });
    return result.docs.map((doc) => ({
      from: normalizePath(doc.from),
      to: normalizePath(doc.to),
      code: asCode(doc.code),
    }));
  } catch (error) {
    console.error("redirect listing failed", error);
    // Same gate as every other loader: empty is correct only on a machine
    // with no database at all. A configured database that errors rethrows,
    // because an empty redirect table cached for a year is a site-wide
    // silent regression of every renamed URL.
    if (isDatabaselessBuild("the redirect table", error)) return [];
    throw error;
  }
}

/**
 * The manifest, assembled from the same cached loaders the routes and the
 * sitemap use. Nothing here queries anything those do not already query, so
 * a warm site answers this from cache entries it already holds.
 */
export async function getRoutingManifest(): Promise<RoutingManifest> {
  const [pages, products, categories, redirects] = await Promise.all([
    listPublishedSlugs(),
    // The base market sees the whole published catalog (see sitemap.ts):
    // a product not sold in a region still has a PDP there.
    listRobots("es"),
    listCategorySlugs(),
    listRedirects(),
  ]);

  return {
    pages,
    products: products.map((product) => product.slug),
    categories,
    redirects,
  };
}
