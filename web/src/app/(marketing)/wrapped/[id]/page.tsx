import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardPage } from "@/components/cards/CardPage";
import { parseTeamId } from "@/lib/fpl";
import { wrappedFor } from "@/lib/wrapped";

type Params = { params: Promise<{ id: string }> };

/** A manager's gameweek, wrapped (ADR-0020). Shareable, but kept out of search engines. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseTeamId((await params).id);
  const image = `/wrapped/${id}/image.png`;
  return {
    title: "Gameweek wrapped",
    description: "One FPL manager's gameweek in numbers: points vs the average, captain, bench and rank.",
    robots: { index: false, follow: false },
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function Wrapped({ params }: Params) {
  const id = parseTeamId((await params).id);
  if (!id) notFound();
  const data = await wrappedFor(id).catch(() => null);
  if (!data) notFound();
  const { squad, wrapped } = data;
  return (
    <CardPage
      path={`/wrapped/${id}`}
      title={`${squad.teamName}: Gameweek ${wrapped.gameweek}, wrapped`}
      sub="Your gameweek in FPL's own numbers: points against the average, your captain, the bench and your rank"
      text={`My FPL Gameweek ${wrapped.gameweek}, wrapped: ${wrapped.net} points${wrapped.average !== null ? ` (average ${wrapped.average})` : ""}`}
      tool={{ href: `/team/${id}`, label: "your team's dugout" }}
      back={{ href: `/team/${id}`, label: "Back to your team" }}
    />
  );
}
