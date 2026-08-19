"use client";

/**
 * Bridges the admin's live-preview iframe to the App Router: on every
 * autosave Payload posts a message, and this refreshes the RSC tree so the
 * draft re-renders. Rendered only in draft mode.
 */
import { RefreshRouteOnSave as PayloadRefresh } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";

export function RefreshRouteOnSave({ serverUrl }: { serverUrl: string }) {
  const router = useRouter();
  return <PayloadRefresh refresh={() => router.refresh()} serverURL={serverUrl} />;
}
