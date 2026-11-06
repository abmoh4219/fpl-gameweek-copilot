import { ImageResponse } from "next/og";
import { CARD_SIZE } from "@/lib/cards/frame";
import { WrappedCard } from "@/lib/cards/images";
import { parseTeamId } from "@/lib/fpl";
import { wrappedFor } from "@/lib/wrapped";

/** One manager's gameweek, wrapped, as a PNG (ADR-0020). FPL's data is cached per team, so a busy card costs FPL nothing extra. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseTeamId((await params).id);
  if (!id) return new Response("Not a team ID", { status: 404 });
  try {
    const { squad, wrapped, finished } = await wrappedFor(id);
    return new ImageResponse(<WrappedCard w={wrapped} team={squad.teamName} finished={finished} />, {
      ...CARD_SIZE,
      headers: { "cache-control": "public, max-age=600, s-maxage=1800" },
    });
  } catch (error) {
    console.error(`wrapped image for team ${id} failed:`, error instanceof Error ? error.message : error);
    return new Response("This team isn't available right now", { status: 404 });
  }
}
