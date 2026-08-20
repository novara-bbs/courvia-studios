import { getRoutingManifest } from "../../../../src/routing/routing-manifest";

/**
 * The routing manifest, for the proxy.
 *
 * Not a public API and not content: it lives under /next/, which robots.txt
 * disallows and the proxy matcher skips. Everything in it is already public
 * (the same slugs the sitemap publishes, plus the URLs that moved), so there
 * is nothing here to protect — only a surface not to advertise.
 *
 * `no-store` on the response, `cacheTag` on the data: the bytes are cheap to
 * re-serialize and the expensive part (four Payload reads) is the cached
 * half. That way a publish invalidates the manifest at the same instant it
 * invalidates the page, with no second TTL to reason about.
 */
export async function GET(): Promise<Response> {
  const manifest = await getRoutingManifest();
  return Response.json(manifest, {
    headers: { "cache-control": "no-store" },
  });
}
