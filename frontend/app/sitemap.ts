import type { MetadataRoute } from "next";
import { site } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-11-07");
  return [
    { url: `${site.url}/`, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/how-it-works`, lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site.url}/risks`, lastModified: updated, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
