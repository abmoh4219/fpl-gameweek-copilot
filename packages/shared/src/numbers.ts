/**
 * Unit helpers. FPL mixes representations, so conversion happens in exactly
 * one place (CLAUDE.md §5).
 */

/** `now_cost` and `value` are in tenths of a million: 55 -> 5.5 */
export function tenthsToMillions(tenths: number): number {
  return Math.round(tenths) / 10;
}

/** Display only. The data layer keeps tenths. */
export function formatMillions(tenths: number): string {
  return `£${tenthsToMillions(tenths).toFixed(1)}m`;
}

/** Safe division for per-90 style rates. */
export function per90(total: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (total / minutes) * 90;
}
