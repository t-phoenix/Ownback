/** Canonical site facts used by metadata, sitemap, manifest and structured data. One place, so they never drift. */

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const site = {
  url: siteUrl(),
  name: "Ownback",
  title: "Ownback · Own what you buy",
  tagline: "Own a piece of what you buy.",
  description:
    "Ownback turns a small share of every purchase into ownership of the companies behind it. Snap a receipt, and a private AI model finds the maker, its suppliers and materials. Your share waits in US-dollar jars in your own vault, and nothing buys without your OK.",
  themeLight: "#F6F8F5",
  themeDark: "#0B2219",
  brand: "#0F7B4F",
  ogImage: { url: "/brand/og.png", width: 1200, height: 630, alt: "Ownback: own a piece of what you buy." },
  /** Pages search engines and answer engines may index. Everything else is the signed-in app. */
  publicPaths: ["/", "/how-it-works", "/risks", "/terms"] as const,
};

/** Titles for app screens; private screens are noindex. */
export const routeTitles: Record<string, string> = {
  "/": "Home", "/signin": "Sign in", "/holdings": "Holdings", "/receipts": "Receipts", "/settings": "Settings",
  "/add": "Add a purchase", "/add/type": "Type a purchase", "/add/reading": "Reading your receipt", "/add/error": "Couldn't read",
  "/jars": "Your jars", "/buy/review": "Review and buy", "/funds": "Add funds", "/activity": "Activity", "/onboarding/rules": "Set your rules",
};
