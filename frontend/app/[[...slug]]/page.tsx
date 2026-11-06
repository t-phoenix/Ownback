import { OwnbackApp } from "../../components/ownback-app";

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const initialPath = slug?.length ? `/${slug.join("/")}` : "/";
  return <OwnbackApp initialPath={initialPath} />;
}
