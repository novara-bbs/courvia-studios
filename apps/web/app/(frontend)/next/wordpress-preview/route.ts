/** Signed WordPress preview handshake. Payload preview remains session-based
 * at /next/preview; keeping the two gates separate avoids weakening either. */
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { editorialSource } from "../../../../src/content/editorial-source";
import { isSafeRelativePath } from "../../../../src/preview/safe-path";
import { secretEquals } from "../../../../src/server/secret-equals";

export async function GET(request: NextRequest): Promise<Response> {
  if (editorialSource() !== "wordpress") return new Response("Not found", { status: 404 });
  const path = request.nextUrl.searchParams.get("path") ?? "/";
  if (!isSafeRelativePath(path)) return new Response("Invalid path", { status: 400 });
  if (
    !secretEquals(
      request.nextUrl.searchParams.get("secret"),
      process.env.WORDPRESS_PREVIEW_SECRET,
    )
  ) {
    return new Response("Unauthorized", { status: 403 });
  }
  (await draftMode()).enable();
  redirect(path);
}
