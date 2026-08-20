import type { MetadataRoute } from "next";

import { siteUrl } from "../src/seo/site-url";

/**
 * `Disallow: /api` used to be here, and it was quietly the most expensive
 * line in the SEO surface: Payload serves every uploaded file under
 * `/api/media/file/…`, so blanket-blocking `/api` told Googlebot-Image not
 * to fetch a single product photograph. For a hardware brand whose listings
 * live or die on the render, that is the whole point of the page.
 *
 * The fix is NOT to open `/api`, which is where the first attempt at this
 * landed: Payload serves its entire REST API from there, so allowing the
 * prefix invites crawlers to walk every collection and global as JSON.
 *
 * What is allowed is the one path that serves bytes: `/api/media/file/`.
 * RFC 9309 — which Google and Bing implement — resolves a conflict by the
 * longest matching rule, so `/api/media/file/tempo-r1.webp` matches the
 * 16-character Allow rather than the 4-character `Disallow: /api`, and the
 * product photograph is crawled while the JSON around it is not.
 *
 * robots.txt governs crawling, not indexing, so the JSON also carries
 * `X-Robots-Tag: noindex, nofollow` from next.config.ts — with the file
 * route exempted, because a noindex on the photographs would reintroduce
 * exactly the problem this comment opens with.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Only the FILE route, not the collection. `/api/media/` would have
        // allowed `/api/media?limit=200`, which answers with the whole media
        // library as JSON — every asset, including the ones the evidence
        // register marks `blocked`, each with the path to its file.
        allow: ["/", "/api/media/file/"],
        disallow: [
          // The CMS itself: never a search result, and cookie-authenticated.
          "/admin",
          // Payload's whole REST surface. `/api/pages?depth=2` is every
          // published page as JSON — a byte-for-byte duplicate of the real
          // page with no canonical and no noindex — and `?page=`, `?limit=`,
          // `?depth=`, `?sort=` and `?where[...]` make each combination a
          // separate URL: a crawl space with no ceiling. The globals are
          // worse: `/api/globals/market-settings` lists which payment
          // providers each market offers.
          "/api",
          // Draft/live-preview entry points: signed, short-lived, not content.
          "/next/",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
