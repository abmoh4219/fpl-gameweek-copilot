import { ImageResponse } from "next/og";
import { fixtureSwings } from "@fpl/shared";
import { fixtureGridData } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { FixtureSwingsCard } from "@/lib/cards/images";

export const revalidate = 3600;

/** The clubs whose run turns easier or harder, as a PNG (ADR-0021). Describes FPL's rating; never advice. */
export async function GET() {
  const { rows } = await fixtureGridData();
  const swings = fixtureSwings(rows);
  const easier = swings.filter((s) => s.direction === "easier").slice(0, 5);
  const harder = swings.filter((s) => s.direction === "harder").reverse().slice(0, 5);
  return new ImageResponse(
    <FixtureSwingsCard easier={easier} harder={harder} rows={new Map(rows.map((r) => [r.teamFplId, r]))} from={swings[0]?.gameweeks[0] ?? null} />,
    CARD_SIZE,
  );
}
