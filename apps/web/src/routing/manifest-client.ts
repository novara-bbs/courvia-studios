/**
 * How the proxy gets the routing manifest.
 *
 * One HTTP call to our own origin, memoized per process for a few seconds.
 * The memo is an optimization, never correctness: Next's proxy documentation
 * warns that the file "can run outside of your application's main runtime",
 * so there may be many isolates each with their own copy, and the freshness
 * that matters is the cache tag on the endpoint itself.
 *
 * The failure direction is deliberate. If the manifest cannot be read the
 * proxy returns `null` and the request falls through exactly as it did
 * before any of this existed: the page renders, and a missing slug streams
 * the localized not-found body with a 200 and a framework-injected
 * `noindex`. Serving a STALE manifest instead would be worse in the one way
 * that matters — a page published minutes ago would answer 404, and a 404 is
 * how a search engine is told to forget a URL.
 */
import { REDIRECT_CODES, ROUTING_MANIFEST_PATH, normalizePath } from "./region-routes";
import type { RedirectCode, RedirectRule, RoutingManifest } from "./region-routes";

/** Short enough that a rename takes effect while an editor is still looking
 *  at the page, long enough that the endpoint is not on the hot path. */
const MEMO_MS = 10_000;

let memo: { at: number; manifest: RoutingManifest } | null = null;
let lastFailureLoggedAt = 0;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function rules(value: unknown): RedirectRule[] {
  if (!Array.isArray(value)) return [];
  const out: RedirectRule[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const { from, to, code } = row as { from?: unknown; to?: unknown; code?: unknown };
    if (typeof from !== "string" || typeof to !== "string") continue;
    out.push({
      from: normalizePath(from),
      to: normalizePath(to),
      code: REDIRECT_CODES.includes(code as RedirectCode) ? (code as RedirectCode) : "301",
    });
  }
  return out;
}

/** Parse defensively: this JSON crosses a network boundary, and a proxy that
 *  throws takes down every route, not one. */
export function parseManifest(value: unknown): RoutingManifest | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.pages)) return null;
  const manifest = {
    pages: strings(source.pages),
    products: strings(source.products),
    categories: strings(source.categories),
    redirects: rules(source.redirects),
  };

  // A manifest that knows about nothing at all is refused rather than
  // believed. A site with zero pages, zero products and zero categories is
  // indistinguishable from a build that prerendered this endpoint without a
  // database — and believing that one would answer 404 for every URL on the
  // site. The cost of being wrong here is one soft 404 on a genuinely empty
  // CMS; the cost of the other mistake is the whole site.
  if (manifest.pages.length + manifest.products.length + manifest.categories.length === 0) {
    return null;
  }
  return manifest;
}

export async function loadRoutingManifest(origin: string): Promise<RoutingManifest | null> {
  const now = Date.now();
  if (memo !== null && now - memo.at < MEMO_MS) return memo.manifest;

  try {
    const response = await fetch(`${origin}${ROUTING_MANIFEST_PATH}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`routing manifest responded ${String(response.status)}`);
    const manifest = parseManifest(await response.json());
    if (manifest === null) throw new Error("routing manifest has an unexpected shape");
    memo = { at: now, manifest };
    return manifest;
  } catch (error) {
    // Once a minute at most: a broken manifest would otherwise write one log
    // line per request, which is how a real signal gets buried.
    if (now - lastFailureLoggedAt > 60_000) {
      lastFailureLoggedAt = now;
      console.error("routing manifest unavailable; redirects and 404s are disabled", error);
    }
    return null;
  }
}

/** Test seam: the memo is process-wide by design. */
export function resetRoutingManifestMemo(): void {
  memo = null;
  lastFailureLoggedAt = 0;
}
