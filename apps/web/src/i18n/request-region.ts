import { DEFAULT_REGION } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import { cache } from "react";

/**
 * Per-request region, for render surfaces that cannot receive params —
 * today, the not-found boundary. React's cache() scopes the store to one
 * server render, so requests never see each other's value.
 *
 * Set it from code that RUNS in the request (the region catch-all, a page
 * calling notFound()), not only from the layout: under PPR the layout's
 * static shell may not re-execute per request.
 */
const store = cache((): { current: RegionId | null } => ({ current: null }));

export function setRequestRegion(region: RegionId): void {
  store().current = region;
}

export function getRequestRegion(): RegionId {
  return store().current ?? DEFAULT_REGION;
}
