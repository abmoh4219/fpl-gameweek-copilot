import { ImageResponse } from "next/og";
import { COMPARE_AXES, comparePlayers } from "@fpl/shared";
import { statRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { CompareCard } from "@/lib/cards/images";

/** Two or three players on one radar, as a PNG (ADR-0020). Reads the shared cached stats only. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams.get("p") ?? "";
  const ids = [...new Set(p.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100_000))].slice(0, 3);
  const { rows } = await statRows();
  return new ImageResponse(<CompareCard lines={comparePlayers(rows, ids)} axes={COMPARE_AXES.map((a) => a.label)} />, {
    ...CARD_SIZE,
    headers: { "cache-control": "public, max-age=1800, s-maxage=3600" },
  });
}
