import { ImageResponse } from "next/og";
import { transferRadar } from "@fpl/shared";
import { dayLabel, deadlines, nextDeadline, statRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { TransferRadarCard } from "@/lib/cards/images";

export const revalidate = 1800;

/** The card as a PNG at a stable address, for the page, downloads and link previews. */
export async function GET() {
  const [{ rows, date }, list] = await Promise.all([statRows(), deadlines()]);
  const gw = nextDeadline(list, new Date())?.gameweek ?? null;
  return new ImageResponse(<TransferRadarCard radar={transferRadar(rows)} gameweek={gw} date={dayLabel(date)} />, CARD_SIZE);
}
