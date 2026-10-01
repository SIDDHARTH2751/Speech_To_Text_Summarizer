import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to FastAPI backend during development
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    ];
  },
};

export default nextConfig;
