import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a self-contained server in .next/standalone, so the app runs in a
  // small Docker container on dj-server1 instead of on Vercel.
  output: "standalone",
};

export default nextConfig;
