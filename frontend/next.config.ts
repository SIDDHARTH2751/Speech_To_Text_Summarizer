import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend API proxy — will point to FastAPI later
  // async rewrites() {
  //   return [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }];
  // },
};

export default nextConfig;
