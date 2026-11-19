import type { Metadata } from "next";
import { LeagueView, leagueIds, leagueMetadata } from "./view";

type Params = { params: Promise<{ id: string }> };

// Built on the first visit, then served from the cache for ten minutes (ADR-0025).
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await leagueIds(params);
  return leagueMetadata(id, null);
}

export default async function League({ params }: Params) {
  const { id } = await leagueIds(params);
  return <LeagueView id={id} me={null} />;
}
