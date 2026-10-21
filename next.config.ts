import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  devIndicators: false,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
