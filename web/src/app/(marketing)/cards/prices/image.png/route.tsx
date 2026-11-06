import { ImageResponse } from "next/og";
import { closestToChange, INSIGHT_CONFIG } from "@fpl/shared";
import { dayLabel, statRows, watchRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { PricesTonightCard } from "@/lib/cards/images";

export const revalidate = 1800;

/** The card as a PNG at a stable address, for the page, downloads and link previews. */
export async function GET() {
  const [rows, { date }] = await Promise.all([watchRows(), statRows()]);
  const n = INSIGHT_CONFIG.cards.priceSize;
  return new ImageResponse(
    <PricesTonightCard rising={closestToChange(rows, "rising", null, n)} falling={closestToChange(rows, "falling", null, n)} date={dayLabel(date)} />,
    CARD_SIZE,
  );
}
