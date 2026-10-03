import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api calls to FastAPI backend during local development.
  // In production, NEXT_PUBLIC_BACKEND_API_URL is set so api.ts
  // calls the backend directly and these rewrites are not used.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
