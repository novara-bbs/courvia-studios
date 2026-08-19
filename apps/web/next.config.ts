import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ["@courvia/ui", "@courvia/design-tokens"],
};

export default nextConfig;
