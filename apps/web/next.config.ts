import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A header set here overrides the route's own: API responses are never shared-cached, and a
  // route that should be cacheable needs an explicit exception in this list.
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
