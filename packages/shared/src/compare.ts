import { INSIGHT_CONFIG } from "./insights/config.ts";
import type { StatRow } from "./stats.ts";

/**
 * Player compare (ADR-0020): each player's place among every outfield player
 * with real minutes, as a percentile per axis, for a radar chart. Percentiles,
 * not raw numbers, so goals and minutes share one scale. The raw figures sit
 * next to the chart, so the shape is never the only thing shown.
 */
export interface CompareAxis {
  id: "points" | "form" | "xgi90" | "goals" | "minutes" | "value";
  label: string;
  value: (r: StatRow) => number;
  format: (v: number) => string;
}

export const COMPARE_AXES: CompareAxis[] = [
  { id: "points", label: "Points", value: (r) => r.totalPoints, format: (v) => String(Math.round(v)) },
  { id: "form", label: "Form", value: (r) => r.form, format: (v) => v.toFixed(1) },
  { id: "xgi90", label: "xGI per 90", value: (r) => r.xgi90, format: (v) => v.toFixed(2) },
  { id: "goals", label: "Goals + assists", value: (r) => r.goals + r.assists, format: (v) => String(Math.round(v)) },
  { id: "minutes", label: "Minutes", value: (r) => r.minutes, format: (v) => Math.round(v).toLocaleString("en-GB") },
  { id: "value", label: "Points per £m", value: (r) => (r.priceM > 0 ? r.totalPoints / r.priceM : 0), format: (v) => v.toFixed(1) },
];

export interface CompareLine {
  row: StatRow;
  /** 0-100 per axis, in COMPARE_AXES order. */
  percentiles: number[];
  raw: string[];
}

/** Share of the pool at or below a value, 0-100. */
function percentile(sorted: readonly number[], v: number): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / sorted.length) * 100);
}

/** The pool is every outfield player with real minutes; the compared players are placed in it even below the bar. */
export function comparePlayers(rows: readonly StatRow[], ids: readonly number[]): CompareLine[] {
  const pool = rows.filter((r) => r.position !== "GKP" && r.minutes >= INSIGHT_CONFIG.stats.minMinutesPer90);
  const sortedByAxis = COMPARE_AXES.map((a) => pool.map(a.value).sort((x, y) => x - y));
  return ids.flatMap((id) => {
    const row = rows.find((r) => r.fplId === id);
    if (!row) return [];
    return [
      {
        row,
        percentiles: COMPARE_AXES.map((a, i) => percentile(sortedByAxis[i]!, a.value(row))),
        raw: COMPARE_AXES.map((a) => a.format(a.value(row))),
      },
    ];
  });
}
