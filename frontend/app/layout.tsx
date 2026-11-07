import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { site } from "../lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: "%s · Ownback" },
  description: site.description,
  applicationName: site.name,
  keywords: ["own what you buy", "fractional shares from receipts", "receipt investing", "spend to own", "USDC jars", "Arc", "0G private AI", "xStocks", "India"],
  authors: [{ name: "Ownback" }],
  creator: "Ownback",
  category: "finance",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", siteName: site.name, url: "/", title: site.title, description: site.description,
    images: [site.ogImage], locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: site.title, description: site.description, images: [site.ogImage.url] },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: site.themeLight },
    { media: "(prefers-color-scheme: dark)", color: site.themeDark },
  ],
};

/** Who we are and what the app is, for search and answer engines (schema.org). */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${site.url}/#org`, name: site.name, url: site.url, logo: `${site.url}/brand/ownback-mark-1024.png`, slogan: site.tagline },
    { "@type": "WebSite", "@id": `${site.url}/#site`, url: site.url, name: site.name, description: site.description, publisher: { "@id": `${site.url}/#org` }, inLanguage: "en" },
    {
      "@type": "WebApplication", "@id": `${site.url}/#app`, name: site.name, url: site.url, applicationCategory: "FinanceApplication",
      operatingSystem: "Web, iOS, Android (installable PWA)", description: site.description, publisher: { "@id": `${site.url}/#org` },
      featureList: [
        "Read receipts and order screenshots with a private AI model on 0G",
        "Find the maker, suppliers and materials behind a product",
        "Save a share of each purchase in US-dollar jars in your own vault on Arc",
        "Approve every buy; fees shown in dollars and percent and capped by you",
      ],
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <body>
      {children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </body>
  </html>;
}
