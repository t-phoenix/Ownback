import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShotsApp } from "../../../components/shots-app";
import { SCREENS, type ShotScreen } from "../../../lib/shot-fixtures";

export const metadata: Metadata = {
  title: "Screenshots",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return SCREENS.map(screen => ({ screen }));
}

export default async function ShotPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!SCREENS.includes(screen as ShotScreen)) notFound();
  return <ShotsApp screen={screen as ShotScreen} />;
}
