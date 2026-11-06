import { ImageResponse } from "next/og";
import { CARD_SIZE } from "@/lib/cards/frame";
import { LeagueCard } from "@/lib/cards/images";
import { parseTeamId } from "@/lib/fpl";
import { loadLeague } from "@/lib/league";

/** A mini-league's table, captains and your differentials, as a PNG (ADR-0021). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseTeamId((await params).id);
  const me = parseTeamId(new URL(request.url).searchParams.get("me") ?? "");
  if (!id) return new Response("Not a league ID", { status: 404 });
  const spy = await loadLeague(id, me).catch((error: unknown) => {
    console.error(`league image for ${id} failed:`, error instanceof Error ? error.message : error);
    return null;
  });
  if (!spy) return new Response("This league isn't available right now", { status: 404 });
  return new ImageResponse(<LeagueCard spy={spy} />, { ...CARD_SIZE, headers: { "cache-control": "public, max-age=900, s-maxage=1800" } });
}
