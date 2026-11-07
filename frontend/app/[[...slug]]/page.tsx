import type { Metadata } from "next";
import { OwnbackApp } from "../../components/ownback-app";
import { routeTitles, site } from "../../lib/site";

type Props = { params: Promise<{ slug?: string[] }> };

/** The app is one client shell; metadata still differs per screen. Only the landing is indexable. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = slug?.length ? `/${slug.join("/")}` : "/";
  const landing = path === "/" || path === "/signin";
  const base = path.split("/").slice(0, 3).join("/");
  const title = landing ? { absolute: site.title } : routeTitles[path] ?? routeTitles[base] ?? routeTitles[`/${slug?.[0] ?? ""}`] ?? "Ownback";
  return {
    title,
    alternates: { canonical: landing ? "/" : path },
    robots: landing ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const initialPath = slug?.length ? `/${slug.join("/")}` : "/";
  return <OwnbackApp initialPath={initialPath} />;
}
