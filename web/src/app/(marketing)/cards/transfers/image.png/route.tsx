import { ImageResponse } from "next/og";
import { transferRadar } from "@fpl/shared";
import { dayLabel, deadlines, fixturesFor, nextDeadline, statRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { TransferRadarCard } from "@/lib/cards/images";

export const revalidate = 1800;

/** The card as a PNG at a stable address, for the page, downloads and link previews. */
export async function GET() {
  const [{ rows, date }, list] = await Promise.all([statRows(), deadlines()]);
  const gw = nextDeadline(list, new Date())?.gameweek ?? null;
  const radar = transferRadar(rows);
  const fixtures = await fixturesFor([...radar.in, ...radar.out].map((r) => r.fplId), 3);
  return new ImageResponse(<TransferRadarCard radar={radar} gameweek={gw} date={dayLabel(date)} fixtures={fixtures} />, CARD_SIZE);
}
