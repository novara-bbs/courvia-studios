import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
