import type { MetadataRoute } from "next";
import { site } from "../lib/site";

/** Public pages are open to search and AI answer crawlers; the signed-in app and the API are not. */
export default function robots(): MetadataRoute.Robots {
  const privateApp = ["/api/", "/add", "/holdings", "/receipts", "/settings", "/jars", "/buy", "/funds", "/activity", "/onboarding"];
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/how-it-works", "/risks", "/terms"], disallow: privateApp },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
