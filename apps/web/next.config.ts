import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Frame sources the embed section can actually produce.
 *
 * These are the exact origins built by PROVIDERS in
 * packages/sections/src/blocks/embed/index.tsx. They are repeated here and
 * not imported: next.config is compiled on its own, before the workspace
 * packages listed in transpilePackages exist as JavaScript, so importing a
 * .tsx module here would break `next build` itself. The duplication is held
 * honest by src/server/security-headers.test.ts, which reads the embed
 * source and fails if a provider is added there without landing here.
 */
export const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;

/** The analytics script tag in app/(frontend)/[region]/layout.tsx. */
const ANALYTICS_ORIGIN = "https://plausible.io";

/**
 * The origin uploads are served from, or "" when they are served by this app.
 *
 * src/payload/storage.ts makes the bucket pure configuration, so the CSP has
 * to be configuration too: hardcoding a bucket hostname would mean the day
 * someone moves from Supabase Storage to R2 the images stop loading and the
 * cause is in a file nobody associates with storage. S3_ENDPOINT is set for
 * every S3-compatible provider except AWS itself, and with forcePathStyle the
 * files live under that same origin. Unset (local disk) -> nothing to add,
 * 'self' already covers it.
 *
 * BUILD TIME, unlike storage.ts, which resolves per request precisely
 * because one build is deployed to both preview and production and only one
 * of them may have a bucket. That asymmetry is harmless while img-src is
 * report-only; promoting it to enforcing needs either one build per
 * environment, a middleware that emits the header per request, or an
 * img-src of `https:` in the enforcing policy and the exact origin only in
 * the report-only one. Decide that before flipping the switch.
 */
function mediaOrigin(): string {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (endpoint === undefined || endpoint === "") return "";
  try {
    return new URL(endpoint).origin;
  } catch {
    // A malformed endpoint is storage.ts's problem to report, not a reason
    // to emit a CSP directive containing garbage.
    return "";
  }
}

/**
 * The resource policy, shipped REPORT-ONLY.
 *
 * Enforcing this blind would break /admin on the first deploy: Payload's
 * panel is a third-party bundle we do not control, and Next's own RSC
 * payload arrives as inline <script> tags that only a nonce (i.e. a
 * middleware, which this app does not have) could whitelist. So the browser
 * reports and does not block, and the console is the data we need before
 * anything here becomes enforcing.
 *
 * frame-ancestors is deliberately ABSENT from this policy: browsers ignore it
 * in a report-only header and log a warning saying so. Framing is enforced
 * for real in securityHeaders() below.
 */
function contentSecurityPolicy(): string {
  const media = mediaOrigin();
  const directives = [
    ["default-src", "'self'"],
    // 'unsafe-inline': the RSC flight payload and next/script inline tags.
    // 'unsafe-eval' in dev only — the HMR runtime evals, and a violation on
    // every dev page load is how a report-only policy stops being read.
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      ANALYTICS_ORIGIN,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    // next/font self-hosts every family (app/(frontend)/fonts.ts), so no
    // font CDN belongs here; data: covers inlined subsets.
    ["font-src", "'self'", "data:"],
    // blob: is the admin's upload preview before the file leaves the browser.
    ["img-src", "'self'", "data:", "blob:", ...(media === "" ? [] : [media])],
    ["media-src", "'self'", ...(media === "" ? [] : [media])],
    // 'self' is not decoration: the admin's live preview iframes this very
    // storefront, so dropping it would break editing, not just embeds.
    ["frame-src", "'self'", ...EMBED_FRAME_ORIGINS],
    ["connect-src", "'self'", ANALYTICS_ORIGIN, ...(isDevelopment ? ["ws:"] : [])],
    ["worker-src", "'self'", "blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
  ];
  return directives.map((parts) => parts.join(" ")).join("; ");
}

/**
 * Headers every response carries.
 *
 * Exported so src/server/security-headers.test.ts asserts on the same value
 * Next serves, instead of on a copy that can drift from it.
 */
/**
 * The directives safe to enforce today.
 *
 * None of them can break a resource load, so none needs the report-only
 * burn-in the fetch directives get: `frame-ancestors` only refuses framing,
 * `object-src 'none'` refuses plugins nothing here uses, and `base-uri
 * 'self'` stops an injected <base> from re-pointing every relative URL on
 * the page — the cheapest defence there is against exactly the stored-markup
 * case the media collection makes possible.
 *
 * frame-ancestors is 'self' rather than 'none' because the admin's live
 * preview iframes the storefront from the same origin (see livePreview in
 * src/payload/pages.ts); 'none' would kill editing while blocking nothing an
 * attacker can do. /admin gets its own 'none' below.
 */
const ENFORCED_POLICY = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

/**
 * Uploads are data, never code.
 *
 * `nosniff` stops a browser RE-TYPING a file, which is not the SVG problem:
 * an SVG served with its own correct `image/svg+xml` and opened directly
 * still runs its inline script in our origin, and `media` accepts `image/*`
 * with `read: anyone` while robots.ts now invites crawlers in. The directive
 * that actually closes it is script-src, and the full policy is still
 * report-only — so the upload path gets its own enforcing policy instead. A
 * static asset route needs no scripts, no plugins and no framing, so
 * `default-src 'none'` cannot break a single legitimate fetch.
 */
const UPLOADS_POLICY = "default-src 'none'; sandbox; frame-ancestors 'none'";

export async function securityHeaders(): Promise<
  Array<{ source: string; headers: Array<{ key: string; value: string }> }>
> {
  return [
    {
      source: "/:path*",
      headers: [
        // Two years and preload-eligible: anything shorter is not accepted by
        // the preload list, and without preload the very first request to the
        // domain is still plaintext.
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        // The media collection is read:anyone and accepts image/*, so an
        // editor can upload an SVG that is served from our own origin. Without
        // nosniff a browser may sniff it as markup and run its scripts as us.
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Nothing in this app asks for a camera, a microphone or a location,
        // and nothing should be silently enrolled in cohort targeting.
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
        // Enforcing, and only frame-ancestors: it is the one directive that
        // cannot break a resource load, so it does not need the report-only
        // burn-in the policy above does. 'self' rather than 'none' because
        // the admin's live preview iframes the storefront from the same
        // origin (see livePreview in src/payload/pages.ts) — 'none' here
        // would kill editing while blocking nothing an attacker can do.
        { key: "Content-Security-Policy", value: ENFORCED_POLICY },
        { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
      ],
    },
    {
      // The panel itself is never the framed document, only the framer, and
      // it is authenticated by a cookie that rides along in any frame. This
      // entry also matches /:path* above; a second CSP header is enforced
      // independently by the browser, so admin ends up with the intersection
      // — 'none' — whether Next appends or overrides.
      source: "/admin/:path*",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
    },
    {
      // Where Payload serves every uploaded file.
      source: "/api/media/:path*",
      headers: [{ key: "Content-Security-Policy", value: UPLOADS_POLICY }],
    },
  ];
}

const nextConfig: NextConfig = {
  experimental: {
    // Unmatched URLs get a real 404 with a branded body. Under PPR a
    // region catch-all cannot do this: the prerendered shell pins the
    // status to 200 (soft 404) or ships an empty body.
    globalNotFound: true,
  },
  // PPR/use-cache rendering model: pages prerender as static shells and the
  // CMS theme is a tagged cache entry (ADR-015). Payload >=3.81 is
  // compatible with this flag.
  cacheComponents: true,
  headers: securityHeaders,
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: [
    "@courvia/ui",
    "@courvia/design-tokens",
    "@courvia/platform",
    "@courvia/appearance",
    "@courvia/sections",
  ],
};

export default withPayload(withNextIntl(nextConfig));
