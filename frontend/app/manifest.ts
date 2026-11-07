import type { MetadataRoute } from "next";
import { site } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: site.title,
    short_name: site.name,
    description: site.description,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: site.themeLight,
    theme_color: site.brand,
    categories: ["finance", "shopping", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // Long-press the home-screen icon: straight to the two things people come back for.
    shortcuts: [
      { name: "Add a purchase", short_name: "Add", url: "/add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Your jars", short_name: "Jars", url: "/jars", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
