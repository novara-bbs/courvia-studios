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

  const region = negotiateRegion(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${region}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except the admin, the API, Next internals and static files.
  matcher: ["/((?!admin|api|_next|_vercel|.*\\..*).*)"],
};
