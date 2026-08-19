/**
 * Enters draft mode for the admin's live preview iframe and for "preview"
 * links. Authenticated Payload users only: the admin cookie rides along on
 * this same-origin request, so payload.auth() is the gate — no shared
 * preview secret to rotate or leak.
 */
import config from "@payload-config";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";

import { isSafeRelativePath } from "../../../../src/preview/safe-path";

export async function GET(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.searchParams.get("path") ?? "/";
  // Only same-origin relative paths: an absolute or scheme-relative URL here
  // would be an open redirect on an authenticated endpoint.
  if (!isSafeRelativePath(path)) {
    return new Response("Invalid path", { status: 400 });
  }

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return new Response("Unauthorized", { status: 403 });
  }

  (await draftMode()).enable();
  redirect(path);
}
