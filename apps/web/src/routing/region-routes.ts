/**
 * What URLs exist under a region, and what to do with one that does not.
 *
 * Pure on purpose. This module is imported by three very different places —
 * `proxy.ts` (which runs before any route and must stay tiny), the Redirects
 * collection (which refuses to shadow a real route) and the tests — so it
 * may not touch Payload, Next or the database. The DATA comes in as a
 * `RoutingManifest`; only the SHAPE of the route tree lives here.
 *
 * Why the proxy and not the page: under `cacheComponents` a page's response
 * has already begun streaming as a 200 by the time it can know the slug is
 * missing, so neither `notFound()` nor `permanentRedirect()` can set a
 * status. Next's own documentation says so and names the fix — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
 * ("If you need a 404 status … run this check in proxy") — and it was
 * measured on this version before any of it was written:
 *
 *   /es/no-existe                 200   (page calls notFound(), soft 404)
 *   rewrite(dest, {status: 404})  200   (a rewrite's status is discarded)
 *   rewrite("/_not-found")        404   (the destination answers 404)
 *
 * ADR-026 records the decision and the measurements.
 */

/**
 * Where the proxy sends a URL that does not exist.
 *
 * Next's own not-found route. Rewriting there is what turns a soft 404 into
 * a real one: the framework answers that path with status 404 and renders
 * `app/global-not-found.tsx`, which is already a full branded document.
 * Choosing it over a hand-rolled 404 body also means the failure mode is
 * benign — if a future Next renames the route, the rewrite lands on nothing,
 * and "nothing" is also served as a 404 (measured), just with the framework's
 * default body instead of ours.
 */
export const NOT_FOUND_PATH = "/_not-found";

/**
 * Where the app publishes the routing manifest the proxy reads.
 *
 * Under /next/ on purpose: robots.txt already disallows that prefix and the
 * proxy matcher already skips it, so the proxy cannot end up intercepting
 * its own lookup.
 */
export const ROUTING_MANIFEST_PATH = "/next/routing";

/** Redirect codes an editor may choose. Never a free-form number. */
export const REDIRECT_CODES = ["301", "302"] as const;
export type RedirectCode = (typeof REDIRECT_CODES)[number];

export interface RedirectRule {
  /** Region-relative source path, e.g. "/tecnologia". */
  from: string;
  /** Region-relative destination path, e.g. "/tecnologia-tempo". */
  to: string;
  code: RedirectCode;
}

export interface RoutingManifest {
  /** Published page slugs (the CMS catch-all). */
  pages: string[];
  /** Published product slugs (`/robots/{slug}`). */
  products: string[];
  /** Category slugs (`/c/{slug}`). */
  categories: string[];
  redirects: RedirectRule[];
}

/**
 * The routes that exist under `[region]` as code rather than as content —
 * one entry per directory in `app/(frontend)/[region]`, minus the CMS
 * catch-all itself.
 *
 * Declared here and checked against the filesystem by
 * `region-routes.test.ts`: adding a route folder without adding it here
 * fails that test, because the proxy would otherwise answer 404 for a page
 * that renders perfectly well.
 */
export interface ReservedRoute {
  /** Does `/{segment}` itself render? (`/c` does not; `/robots` does.) */
  index: boolean;
  /** Which manifest list the child segment must appear in, if any. */
  child: "products" | "categories" | null;
}

export const RESERVED_ROUTES: Record<string, ReservedRoute> = {
  robots: { index: true, child: "products" },
  c: { index: false, child: "categories" },
  comparar: { index: true, child: null },
  gracias: { index: true, child: null },
};

export type RouteDecision =
  | { kind: "pass" }
  | { kind: "redirect"; to: string; code: RedirectCode }
  | { kind: "not-found" };

/** A path segment an editor can produce: kebab-case, no dots, no spaces. */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Next's generated metadata images hang off the segment that declares them
 * and carry a build hash: `/es/privacidad/opengraph-image-1plxrj`. They are
 * routes the framework creates, not content, and they are invisible to the
 * manifest — so the first version of this file 404'd every Open Graph card
 * it had just generated. They are recognised here rather than excluded in
 * the proxy matcher, which has to be a literal and cannot know the hash.
 */
const METADATA_IMAGE = /^(opengraph-image|twitter-image|icon|apple-icon)(-[a-z0-9]+)?$/;

/**
 * Region-relative path in canonical form: leading slash, no trailing slash,
 * lower case. "" and "/" both become "/" — the region home.
 */
export function normalizePath(path: string): string {
  const trimmed = path.trim().toLowerCase();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailing = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  return withoutTrailing === "" ? "/" : withoutTrailing;
}

/** True for a path an editor may type into a redirect: "/a" or "/a/b". */
export function isValidPath(path: string): boolean {
  if (path === "/") return true;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const segments = path.slice(1).split("/");
  return segments.length <= 2 && segments.every((segment) => SEGMENT.test(segment));
}

/**
 * Follow a redirect to its final destination.
 *
 * The Pages hook keeps chains flat (renaming A→B→C leaves A→C and B→C, never
 * A→B), so one hop is the normal case. The loop is here for rows an editor
 * wrote by hand: it stops at `maxHops` and at the first repeat, so a cycle
 * costs a few string comparisons instead of a hung request.
 */
export function followRedirect(
  rules: readonly RedirectRule[],
  from: string,
  maxHops = 4,
): RedirectRule | null {
  let current = normalizePath(from);
  const seen = new Set<string>([current]);
  // The code of the FIRST hop is what the visitor is told: it describes
  // whether the original URL moved permanently, which a later hop cannot
  // weaken.
  let code: RedirectCode | null = null;
  let destination: string | null = null;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = rules.find((candidate) => normalizePath(candidate.from) === current);
    if (next === undefined) break;
    const target = normalizePath(next.to);
    if (seen.has(target)) break;
    seen.add(target);
    code ??= next.code;
    destination = target;
    current = target;
  }

  if (destination === null || code === null) return null;
  return { from, to: destination, code };
}

/**
 * Would adding `from → to` create a loop with the rules already stored?
 *
 * The obvious loop (`from === to`) is only the first case. `/a → /b` next to
 * an existing `/b → /a` is the same bug one row further away, and a visitor
 * meets it as a browser error page, not as a 404 — so it is refused at the
 * point of writing rather than survived at request time.
 */
export function wouldCycle(rules: readonly RedirectRule[], from: string, to: string): boolean {
  const start = normalizePath(from);
  let current = normalizePath(to);
  const seen = new Set<string>([current]);
  for (let hop = 0; hop < 32; hop += 1) {
    if (current === start) return true;
    const next = rules.find((rule) => normalizePath(rule.from) === current);
    if (next === undefined) return false;
    current = normalizePath(next.to);
    if (seen.has(current)) return current === start;
    seen.add(current);
  }
  return true;
}

/** True when a path is served by a route in the app rather than by content. */
export function isReservedPath(path: string, manifest?: RoutingManifest): boolean {
  const segments = normalizePath(path).split("/").filter(Boolean);
  const [head, tail] = segments;
  if (head === undefined) return true; // the region home
  const reserved = RESERVED_ROUTES[head];
  if (reserved === undefined) return false;
  if (segments.length === 1) return true;
  if (segments.length !== 2 || tail === undefined) return false;
  if (reserved.child === null) return false;
  return manifest === undefined ? true : manifest[reserved.child].includes(tail);
}

/**
 * What the proxy should do with one region-relative path.
 *
 * Redirects are consulted first and unconditionally: a row that shadows a
 * live route cannot be created (the collection validates against this same
 * table), but one written before a route existed still has to be obeyed
 * predictably rather than half-applied.
 */
export function resolveRegionPath(path: string, manifest: RoutingManifest): RouteDecision {
  const normalized = normalizePath(path);

  const redirect = followRedirect(manifest.redirects, normalized);
  if (redirect !== null && redirect.to !== normalized) {
    return { kind: "redirect", to: redirect.to, code: redirect.code };
  }

  const segments = normalized.split("/").filter(Boolean);
  const [head, tail] = segments;
  if (head === undefined) return { kind: "pass" };

  // Framework-generated images belong to whatever segment declared them; if
  // that segment is gone, Next answers 404 by itself.
  const last = segments[segments.length - 1];
  if (last !== undefined && METADATA_IMAGE.test(last)) return { kind: "pass" };

  const reserved = RESERVED_ROUTES[head];
  if (segments.length === 1) {
    if (reserved !== undefined) return reserved.index ? { kind: "pass" } : { kind: "not-found" };
    return manifest.pages.includes(head) ? { kind: "pass" } : { kind: "not-found" };
  }

  if (segments.length === 2 && tail !== undefined && reserved?.child != null) {
    return manifest[reserved.child].includes(tail) ? { kind: "pass" } : { kind: "not-found" };
  }

  // Three segments or more: nothing in the app router serves them.
  return { kind: "not-found" };
}
