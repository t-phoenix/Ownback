import type { NextConfig } from "next";

/**
 * The browser always calls same-origin `/api/*`; we proxy it to the API.
 * Same-origin keeps the Lax session + CSRF cookies working in production (no third-party cookies, no CORS).
 */
const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return API.startsWith("http") ? [{ source: "/api/:path*", destination: `${API}/:path*` }] : [];
  },
};

export default nextConfig;
