import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ["@courvia/ui", "@courvia/design-tokens", "@courvia/platform"],
};

export default withPayload(nextConfig);
