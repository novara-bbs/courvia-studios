/**
 * Edge proxy (Next 16's middleware). Two jobs, both of which must happen
 * BEFORE a response starts streaming:
 *
 * 1. Paths without a region prefix get one. Negotiation SUGGESTS, never
 *    forces (docs/markets.md §9, ADR-020): deep links to a region are never
 *    rewritten, and the selector in the footer lets anyone switch — this
 *    only picks a sensible landing for prefix-less URLs.
 * 2. Inside a region, a URL that moved is redirected and a URL that does not
 *    exist is answered with a real 404. Neither can be done from a page:
 *    under `cacheComponents` the static shell has already gone out as a 200
 *    by the time the page knows (ADR-026 and src/routing/region-routes.ts
 *    carry the measurements).
 */
import { DEFAULT_REGION, isRegionId, publishedRegionFor } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { loadRoutingManifest } from "./src/routing/manifest-client";
import { NOT_FOUND_PATH, resolveRegionPath } from "./src/routing/region-routes";

/**
 * Next's draft-mode cookie. Repeated rather than imported: the constant
 * lives at `next/dist/server/api-utils`, a private path, and `proxy.ts` is
 * the one file that must not grow deep framework imports. `proxy.test.ts`
 * reads the framework's own value and fails if this drifts.
 *
 * Preview must bypass every check below: a draft page is not in the
 * manifest, so an editor previewing an unpublished page would be told, by
 * their own site, that it does not exist.
 */
const DRAFT_COOKIE = "__prerender_bypass";

/**
 * The region the visitor's languages point at, before publication is taken
 * into account. `ar` still points at ar-ae here: the table describes
 * language, not what we ship.
 */
function preferredRegion(acceptLanguage: string | null): RegionId {
  if (acceptLanguage === null) return DEFAULT_REGION;
  for (const part of acceptLanguage.split(",")) {
    const lang = (part.split(";")[0] ?? "").trim().toLowerCase();
    if (lang.startsWith("ar")) return "ar-ae";
    if (lang === "en-ae") return "en-ae";
    if (lang.startsWith("en")) return "en-gb";
    if (lang.startsWith("es")) return "es";
  }
  return DEFAULT_REGION;
}

/**
 * …and the region we actually land them on. publishedRegionFor keeps a
 * prepared region out of the suggestion: sending an Arabic browser to
 * /ar-ae would be steering it, unasked, onto a page we tell crawlers not to
 * index and whose body is in Spanish. It falls to the published region of
 * the SAME market, so that visitor gets /en-ae — UAE pricing, in the
 * language Phase 1 actually publishes (ADR-09).
 *
 * A deep link to /ar-ae is untouched, as it always was: this function only
 * ever runs on paths that carry no region at all.
 */
function negotiateRegion(acceptLanguage: string | null): RegionId {
  return publishedRegionFor(preferredRegion(acceptLanguage));
}

/**
 * A URL inside a region: obey a redirect, or refuse a path that does not
 * exist with a status a crawler believes.
 *
 * Everything here fails open. No manifest (a cold start, a deploy in
 * flight, a broken endpoint) means `next()`, which is exactly the behaviour
 * this app had before: the page renders and a missing slug streams the
 * localized not-found body with 200 + `noindex`. Refusing to serve pages
 * because a side lookup failed would be the worse trade by far.
 */
async function resolveInsideRegion(
  request: NextRequest,
  region: RegionId,
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const path = pathname.slice(`/${region}`.length);
  if (path === "" || path === "/") return null;

  const manifest = await loadRoutingManifest(request.nextUrl.origin);
  if (manifest === null) return null;

  const decision = resolveRegionPath(path, manifest);
  if (decision.kind === "pass") return null;

  const url = request.nextUrl.clone();
  if (decision.kind === "redirect") {
    url.pathname = `/${region}${decision.to === "/" ? "" : decision.to}`;
    return NextResponse.redirect(url, Number(decision.code));
  }

  // The same page under a second spelling. 308 and not 301 for two reasons
  // that point the same way: it is the code this file already emits one
  // segment earlier for `/ES/robots`, so a stray capital gets one answer
  // wherever it lands; and 301 is the enum an EDITOR picks from
  // (ADR-026 §3), which a redirect no human wrote has no business appearing
  // in. Google treats 301 and 308 identically when choosing a canonical.
  if (decision.kind === "canonical") {
    url.pathname = `/${region}${decision.to === "/" ? "" : decision.to}`;
    return NextResponse.redirect(url, 308);
  }

  // The one rewrite in the app. Its destination answers 404 by itself; the
  // status of THIS response is discarded (measured — see region-routes.ts),
  // which is precisely why the destination has to be a route that already
  // knows it is a 404.
  url.pathname = NOT_FOUND_PATH;
  url.search = "";
  return NextResponse.rewrite(url);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isRegionId(firstSegment)) {
    // Draft mode renders unpublished content on purpose; the manifest only
    // knows what is published.
    if (request.cookies.has(DRAFT_COOKIE)) return NextResponse.next();
    return (await resolveInsideRegion(request, firstSegment)) ?? NextResponse.next();
  }

  // /ES or /En-GB are the same region typed loudly: canonicalize with a
  // permanent redirect instead of prefixing a second region.
  const lowered = firstSegment.toLowerCase();
  if (isRegionId(lowered)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lowered}${pathname.slice(firstSegment.length + 1)}`;
    return NextResponse.redirect(url, 308);
  }

  const region = negotiateRegion(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${region}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except the admin, the API, the preview endpoints, Next
  // internals and static files. Exclusions are anchored to whole segments so
  // /admin-foo or /apis still get a region prefix (and the localized 404).
  matcher: ["/((?!admin(?:/|$)|api(?:/|$)|next(?:/|$)|_next|_vercel|.*\\..*).*)"],
};
