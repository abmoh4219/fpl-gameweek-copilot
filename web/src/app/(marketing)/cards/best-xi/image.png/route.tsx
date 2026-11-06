import { ImageResponse } from "next/og";
import { bestXiBy } from "@fpl/shared";
import { latestGameweekPoints, statRows } from "@/lib/cards/data";
import { CARD_SIZE } from "@/lib/cards/frame";
import { BestXiCard } from "@/lib/cards/images";

export const revalidate = 1800;

/** The latest gameweek's highest-scoring legal XI, as a PNG (ADR-0021). */
export async function GET() {
  const [{ rows }, latest] = await Promise.all([statRows(), latestGameweekPoints()]);
  const points = latest?.points ?? new Map<number, number>();
  const xi = latest ? bestXiBy(rows, (r) => points.get(r.fplId) ?? 0) : null;
  return new ImageResponse(<BestXiCard xi={xi} gameweek={latest?.gameweek ?? 0} finished={latest?.finished ?? true} points={points} />, CARD_SIZE);
}
