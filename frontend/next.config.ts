import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No rewrites needed — frontend calls the backend directly
  // using the NEXT_PUBLIC_BACKEND_API_URL environment variable.
};

export default nextConfig;
