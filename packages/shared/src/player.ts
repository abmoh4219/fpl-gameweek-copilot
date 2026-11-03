/**
 * The player page: one player's season from `api.player_gameweeks`, their
 * price moves from `api.price_changes_daily`, and a few ratios for the rings.
 * Pure functions; every number is FPL's own or a sum of them.
 */

/** A row of `api.player_gameweeks`. */
export interface GameweekViewRow {
  fpl_id: number;
  gameweek: number;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  expected_goals: number | string;
  expected_assists: number | string;
  expected_goal_involvements: number | string;
  defensive_contribution: number;
  points_breakdown: Record<string, number> | null;
}

export interface GameweekPoint {
  gameweek: number;
  points: number;
  minutes: number;
  xgi: number;
  goals: number;
  assists: number;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Points per gameweek, oldest first; a gameweek with no row is shown as a blank, not a zero. */
export function gameweekSeries(rows: readonly GameweekViewRow[]): GameweekPoint[] {
  return [...rows]
    .sort((a, b) => a.gameweek - b.gameweek)
    .map((r) => ({
      gameweek: r.gameweek,
      points: num(r.total_points),
      minutes: num(r.minutes),
      xgi: num(r.expected_goal_involvements),
      goals: num(r.goals_scored),
      assists: num(r.assists),
    }));
}

/** FPL's stat identifiers, in the order a breakdown reads, with plain names. */
const PARTS: [string, string][] = [
  ["minutes", "Playing time"],
  ["goals_scored", "Goals"],
  ["assists", "Assists"],
  ["clean_sheets", "Clean sheets"],
  ["defensive_contribution", "Defensive contributions"],
  ["saves", "Saves"],
  ["penalties_saved", "Penalty saves"],
  ["bonus", "Bonus"],
];

const DEDUCTIONS: Record<string, string> = {
  goals_conceded: "Goals conceded",
  yellow_cards: "Yellow cards",
  red_cards: "Red cards",
  own_goals: "Own goals",
  penalties_missed: "Penalties missed",
};

export interface BreakdownPart {
  id: string;
  label: string;
  points: number;
}

/**
 * Where a player's season points came from. Positive parts in reading order
 * (a part at zero is left out); deductions separately, because a negative
 * can't be a slice of a bar. Any identifier FPL adds later falls into "Other".
 */
export function pointsBreakdown(rows: readonly GameweekViewRow[]): { parts: BreakdownPart[]; deductions: BreakdownPart[]; total: number } {
  const sums = new Map<string, number>();
  for (const r of rows) for (const [k, v] of Object.entries(r.points_breakdown ?? {})) sums.set(k, (sums.get(k) ?? 0) + num(v));

  const known = new Set([...PARTS.map(([k]) => k), ...Object.keys(DEDUCTIONS)]);
  const parts: BreakdownPart[] = PARTS.map(([id, label]) => ({ id, label, points: sums.get(id) ?? 0 })).filter((p) => p.points > 0);
  const other = [...sums.entries()].filter(([k]) => !known.has(k)).reduce((a, [, v]) => a + v, 0);
  if (other > 0) parts.push({ id: "other", label: "Other", points: other });

  const deductions: BreakdownPart[] = Object.entries(DEDUCTIONS)
    .map(([id, label]) => ({ id, label, points: sums.get(id) ?? 0 }))
    .filter((d) => d.points < 0);
  const total = parts.reduce((a, p) => a + p.points, 0) + deductions.reduce((a, d) => a + d.points, 0);
  return { parts, deductions, total };
}

export interface PricePoint {
  date: string;
  priceM: number;
}

/**
 * The price line, rebuilt from confirmed changes: walk back from today's
 * price, undoing each change. Starts at the first tracked change's eve.
 */
export function priceHistory(currentPriceM: number, changes: readonly { changed_on: string; change_m: number }[], today: string): PricePoint[] {
  const sorted = [...changes].sort((a, b) => b.changed_on.localeCompare(a.changed_on));
  const points: PricePoint[] = [{ date: today, priceM: round1(currentPriceM) }];
  let price = currentPriceM;
  for (const c of sorted) {
    points.push({ date: c.changed_on, priceM: round1(price) });
    price -= num(c.change_m);
    points.push({ date: dayBefore(c.changed_on), priceM: round1(price) });
  }
  return dedupe(points.reverse());
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dedupe(points: PricePoint[]): PricePoint[] {
  return points.filter((p, i) => i === 0 || p.date !== points[i - 1]!.date || p.priceM !== points[i - 1]!.priceM);
}

/** Share of the possible minutes played, over the gameweeks the season has had (doubles count twice). */
export function minutesShare(totalMinutes: number, gameweeksPlayed: number): number {
  if (gameweeksPlayed <= 0) return 0;
  return Math.max(0, Math.min(1, totalMinutes / (gameweeksPlayed * 90)));
}
