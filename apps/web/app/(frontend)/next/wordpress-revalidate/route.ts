/** WordPress calls this after a publish/update. The body names the editorial
 * cache entry; it cannot invalidate arbitrary paths. */
import { LOCALES } from "@courvia/platform";
import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { editorialSource } from "../../../../src/content/editorial-source";
import { secretEquals } from "../../../../src/server/secret-equals";

interface RevalidationBody {
  slug?: unknown;
  locale?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (editorialSource() !== "wordpress") return new Response("Not found", { status: 404 });
  const authorization = request.headers.get("authorization");
  const received = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!secretEquals(received, process.env.WORDPRESS_REVALIDATE_SECRET)) {
    return new Response("Unauthorized", { status: 403 });
  }

  let body: RevalidationBody;
  try {
    body = (await request.json()) as RevalidationBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const locale = typeof body.locale === "string" ? body.locale : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !(LOCALES as readonly string[]).includes(locale)) {
    return new Response("Invalid page identity", { status: 400 });
  }

  revalidateTag(`page:${slug}`, "max");
  revalidateTag("pages", "max");
  return Response.json({ revalidated: true, slug, locale });
}
