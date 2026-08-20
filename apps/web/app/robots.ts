import type { MetadataRoute } from "next";

import { siteUrl } from "../src/seo/site-url";

/**
 * `Disallow: /api` used to be here, and it was quietly the most expensive
 * line in the SEO surface: Payload serves every uploaded file under
 * `/api/media/file/…`, so blanket-blocking `/api` told Googlebot-Image not
 * to fetch a single product photograph. For a hardware brand whose listings
 * live or die on the render, that is the whole point of the page.
 *
 * So the block is now per-path and names what actually must not be crawled —
 * the admin panel, the GraphQL endpoint, the auth collection and the preview
 * routes — with media explicitly allowed. Google honours the most specific
 * matching rule, so the `Allow` wins inside the disallowed prefix.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/"],
        disallow: [
          // The CMS itself: never a search result, and cookie-authenticated.
          "/admin",
          // A crawlable query endpoint is a crawlable way to walk the schema.
          "/api/graphql",
          // The auth collection's REST surface.
          "/api/users",
          // Draft/live-preview entry points: signed, short-lived, not content.
          "/next/",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
