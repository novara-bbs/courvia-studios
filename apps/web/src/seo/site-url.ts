/**
 * The single source of the public origin. Canonicals, hreflang, sitemap,
 * robots, JSON-LD and llms.txt all derive from here so they cannot drift.
 *
 * Resolution order: explicit env var -> Vercel's production URL -> throw on
 * a real production deploy with neither -> localhost for dev/CI builds
 * (CI artifacts are never served, so localhost there is harmless; a real
 * deploy without a configured origin would silently canonicalize the whole
 * site to localhost, which is why that case fails loudly instead).
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured !== undefined && configured !== "") return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel !== undefined && vercel !== "") return `https://${vercel}`;

  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set on a production deploy: every canonical, hreflang and sitemap URL would point at localhost.",
    );
  }
  return "http://localhost:3000";
}
