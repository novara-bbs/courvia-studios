/**
 * The slug of the page document that IS a region's home.
 *
 * The home is CMS content like any other page, which means one slug has a
 * second meaning: `/es/inicio` and `/es` would be the same page at two URLs.
 * Four places already knew that and each held its own copy of the literal —
 * the region root that loads it, the catch-all that redirects it away, the
 * OG image route, and the sitemap that filters it out of the page list.
 * `llms.txt` was the fifth place and did NOT know, so it published
 * `/es/inicio` under "Policies": a permanent redirect handed to an assistant
 * as a citable URL, with the front page presented as a policy document.
 *
 * A literal repeated in five files is one rename away from being wrong in
 * four of them. It lives here now.
 */
export const HOME_SLUG = "inicio";

/**
 * Page slugs with the home removed — what every surface that LISTS pages
 * wants, because the home is already reachable at the region root.
 */
export function withoutHome(slugs: readonly string[]): string[] {
  return slugs.filter((slug) => slug !== HOME_SLUG);
}
