import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // PPR/use-cache rendering model: pages prerender as static shells and the
  // CMS theme is a tagged cache entry (ADR-015). Payload >=3.81 is
  // compatible with this flag.
  cacheComponents: true,
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ["@courvia/ui", "@courvia/design-tokens", "@courvia/platform"],
};

export default withPayload(withNextIntl(nextConfig));
