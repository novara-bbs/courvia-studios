/**
 * Edge proxy (Next 16's middleware). One job: paths without a region prefix
 * get one. Negotiation SUGGESTS, never forces (CLAUDE.md §9): deep links to
 * a region are never rewritten, and the selector in the footer lets anyone
 * switch — this only picks a sensible landing for prefix-less URLs.
 */
import { DEFAULT_REGION, isRegionId } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function negotiateRegion(acceptLanguage: string | null): RegionId {
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

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isRegionId(firstSegment)) return NextResponse.next();

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
