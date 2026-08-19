/** Leaves draft mode and returns to the published view. */
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { isSafeRelativePath } from "../../../../src/preview/safe-path";

export async function GET(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.searchParams.get("path") ?? "/";
  // Unauthenticated GET: a lax check here is a no-login open-redirect
  // gadget, so reject anything that could resolve cross-origin.
  if (!isSafeRelativePath(path)) {
    return new Response("Invalid path", { status: 400 });
  }
  (await draftMode()).disable();
  redirect(path);
}
