import { ImageResponse } from "next/og";
import { templateXi } from "@fpl/shared";
import { deadlines, nextDeadline, statRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { TemplateXiCard } from "@/lib/cards/images";

export const revalidate = 3600;

/** The card as a PNG at a stable address, for the page, downloads and link previews. */
export async function GET() {
  const [{ rows }, list] = await Promise.all([statRows(), deadlines()]);
  const gw = nextDeadline(list, new Date())?.gameweek ?? null;
  return new ImageResponse(<TemplateXiCard xi={templateXi(rows)} gameweek={gw} />, CARD_SIZE);
}
