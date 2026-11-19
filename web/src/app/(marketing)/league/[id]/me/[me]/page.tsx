import type { Metadata } from "next";
import { LeagueView, leagueIds, leagueMetadata } from "../../view";

type Params = { params: Promise<{ id: string; me: string }> };

/**
 * /league/<id>?me=<team>, rewritten here by next.config so the league with
 * "you" is a cached page of its own (ADR-0025). The address people see and
 * share keeps ?me=.
 */
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, me } = await leagueIds(params);
  return leagueMetadata(id, me);
}

export default async function LeagueWithYou({ params }: Params) {
  const { id, me } = await leagueIds(params);
  return <LeagueView id={id} me={me} />;
}
