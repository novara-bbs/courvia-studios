/** Leaves draft mode and returns to the published view. */
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.searchParams.get("path") ?? "/";
  if (!path.startsWith("/") || path.startsWith("//")) {
    return new Response("Invalid path", { status: 400 });
  }
  (await draftMode()).disable();
  redirect(path);
}
