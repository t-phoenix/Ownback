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
  async headers() {
    // A CSP isn't set yet: Privy loads wallet frames and RPCs from several origins; add one once that list is pinned.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/creatives/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
  async rewrites() {
    return API.startsWith("http") ? [{ source: "/api/:path*", destination: `${API}/:path*` }] : [];
  },
};

export default nextConfig;
