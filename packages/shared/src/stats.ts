import { INSIGHT_CONFIG } from "./insights/config.ts";
import { POSITION_BY_TYPE } from "./squad.ts";

/**
 * Season leaderboards for the stats hub: pure functions over `api.player_current`
 * rows. Every figure is FPL's own season total or a ratio of two of them;
 * nothing here is forward-looking.
 */

export type StatPosition = "GKP" | "DEF" | "MID" | "FWD";

/** One player, as the stats hub reads them. */
export interface StatRow {
  fplId: number;
  webName: string;
  team: string;
  teamCode: number;
  position: StatPosition;
  priceM: number;
  status: string;
  minutes: number;
  totalPoints: number;
  form: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  bps: number;
  ict: number;
  xg: number;
  xa: number;
  xgi: number;
  xg90: number;
  xa90: number;
  xgi90: number;
  defensiveContribution: number;
  ownership: number;
  netTransfers: number;
}

/** The view's columns the stats hub selects, in the view's own names. */
export const STAT_COLUMNS = [
  "fpl_id", "web_name", "team_short_name", "team_code", "element_type", "price_m", "status", "minutes",
  "total_points", "form", "goals_scored", "assists", "clean_sheets", "bonus", "bps", "ict_index",
  "expected_goals", "expected_assists", "expected_goal_involvements", "expected_goals_per_90",
  "expected_assists_per_90", "expected_goal_involvements_per_90", "defensive_contribution",
  "selected_by_percent", "net_transfers_event",
] as const;

export type StatViewRow = Record<(typeof STAT_COLUMNS)[number], string | number | null>;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function statRowFromView(r: StatViewRow): StatRow | null {
  const position = POSITION_BY_TYPE[num(r.element_type) as 1 | 2 | 3 | 4] as StatPosition | undefined;
  if (!position || typeof r.web_name !== "string") return null;
  return {
    fplId: num(r.fpl_id),
    webName: r.web_name,
    team: String(r.team_short_name ?? ""),
    teamCode: num(r.team_code),
    position,
    priceM: num(r.price_m),
    status: String(r.status ?? "a"),
    minutes: num(r.minutes),
    totalPoints: num(r.total_points),
    form: num(r.form),
    goals: num(r.goals_scored),
    assists: num(r.assists),
    cleanSheets: num(r.clean_sheets),
    bonus: num(r.bonus),
    bps: num(r.bps),
    ict: num(r.ict_index),
    xg: num(r.expected_goals),
    xa: num(r.expected_assists),
    xgi: num(r.expected_goal_involvements),
    xg90: num(r.expected_goals_per_90),
    xa90: num(r.expected_assists_per_90),
    xgi90: num(r.expected_goal_involvements_per_90),
    defensiveContribution: num(r.defensive_contribution),
    ownership: num(r.selected_by_percent),
    netTransfers: num(r.net_transfers_event),
  };
}

export type StatFormat = "int" | "dec1" | "dec2" | "pct" | "signed";

export interface Leaderboard {
  id: string;
  label: string;
  group: "Attack" | "Expected" | "FPL" | "Defence" | "Market";
  /** What the number means, shown under the table. */
  note: string;
  format: StatFormat;
  value: (r: StatRow) => number;
  /** Per-90 boards need minutes behind the rate. */
  per90?: boolean;
  /** Only these positions make sense on this board. */
  positions?: readonly StatPosition[];
}

export const LEADERBOARDS: readonly Leaderboard[] = [
  { id: "goals", label: "Goals", group: "Attack", format: "int", value: (r) => r.goals, note: "Goals scored this season." },
  { id: "assists", label: "Assists", group: "Attack", format: "int", value: (r) => r.assists, note: "FPL assists this season." },
  { id: "ga", label: "Goals + assists", group: "Attack", format: "int", value: (r) => r.goals + r.assists, note: "Goals plus assists this season." },
  { id: "xg", label: "xG", group: "Expected", format: "dec2", value: (r) => r.xg, note: "Expected goals: the quality of chances taken this season." },
  { id: "xa", label: "xA", group: "Expected", format: "dec2", value: (r) => r.xa, note: "Expected assists: the quality of chances created this season." },
  { id: "xgi", label: "xGI", group: "Expected", format: "dec2", value: (r) => r.xgi, note: "Expected goal involvements: xG plus xA." },
  { id: "xgi90", label: "xGI per 90", group: "Expected", format: "dec2", value: (r) => r.xgi90, per90: true, note: "Expected goal involvements per 90 minutes played." },
  { id: "points", label: "Points", group: "FPL", format: "int", value: (r) => r.totalPoints, note: "FPL points this season." },
  { id: "form", label: "Form", group: "FPL", format: "dec1", value: (r) => r.form, note: "FPL's form: average points per match over the last 30 days." },
  { id: "value", label: "Points per £m", group: "FPL", format: "dec1", value: (r) => (r.priceM > 0 ? r.totalPoints / r.priceM : 0), note: "Season points divided by current price." },
  { id: "bonus", label: "Bonus", group: "FPL", format: "int", value: (r) => r.bonus, note: "Bonus points this season." },
  { id: "bps", label: "BPS", group: "FPL", format: "int", value: (r) => r.bps, note: "The bonus points system score this season." },
  { id: "cs", label: "Clean sheets", group: "Defence", format: "int", value: (r) => r.cleanSheets, positions: ["GKP", "DEF"], note: "Clean sheets this season, goalkeepers and defenders." },
  { id: "defcon", label: "Defensive contributions", group: "Defence", format: "int", value: (r) => r.defensiveContribution, positions: ["DEF", "MID", "FWD"], note: "Tackles, interceptions, clearances and blocks (plus recoveries for midfielders and forwards) this season." },
  { id: "owned", label: "Most owned", group: "Market", format: "pct", value: (r) => r.ownership, note: "Share of FPL managers who own the player." },
  { id: "in", label: "Transferred in", group: "Market", format: "signed", value: (r) => r.netTransfers, note: "Net transfers in this gameweek." },
];

export interface StatFilters {
  position?: StatPosition | null;
  maxPriceM?: number | null;
}

/**
 * One leaderboard, best first. Ties go to more season points, then by name,
 * so the order is stable. Per-90 boards only rank players with enough minutes.
 */
export function leaderboard(rows: readonly StatRow[], board: Leaderboard, filters: StatFilters = {}, limit: number = INSIGHT_CONFIG.stats.rows): StatRow[] {
  const { minMinutesPer90 } = INSIGHT_CONFIG.stats;
  return rows
    .filter((r) => !filters.position || r.position === filters.position)
    .filter((r) => !board.positions || board.positions.includes(r.position))
    .filter((r) => filters.maxPriceM == null || r.priceM <= filters.maxPriceM)
    .filter((r) => !board.per90 || r.minutes >= minMinutesPer90)
    .sort((a, b) => board.value(b) - board.value(a) || b.totalPoints - a.totalPoints || a.webName.localeCompare(b.webName))
    .slice(0, limit);
}

export function formatStat(value: number, format: StatFormat): string {
  switch (format) {
    case "int":
      return Math.round(value).toLocaleString("en-GB");
    case "dec1":
      return value.toFixed(1);
    case "dec2":
      return value.toFixed(2);
    case "pct":
      return `${value.toFixed(1)}%`;
    case "signed":
      return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-GB")}`;
  }
}

// --------------------------------------------------------------- charts --

export interface ChartPoint {
  fplId: number;
  x: number;
  y: number;
  label: string;
  sub: string;
  /** "hi" and "lo" are the two sides of the chart's story; "base" is context. */
  tone: "base" | "hi" | "lo";
  /** Direct-labelled on the chart (sparingly). */
  labelled: boolean;
}

const sub = (r: StatRow) => `${r.team} · ${r.position} · £${r.priceM.toFixed(1)}m`;

function chartPool(rows: readonly StatRow[], position: StatPosition | null): StatRow[] {
  return rows.filter((r) => r.minutes >= INSIGHT_CONFIG.stats.chartMinMinutes && (!position || r.position === position));
}

function mark(points: ChartPoint[], ids: Set<number>, tone: "hi" | "lo") {
  for (const p of points) if (ids.has(p.fplId)) Object.assign(p, { tone, labelled: true });
}

/**
 * Finishing: goals against xG. Above the diagonal a player has scored more
 * than their chances suggest ("hi"), below it fewer ("lo"). The biggest gaps
 * each way are labelled. Goalkeepers are left out (no xG to speak of).
 */
export function finishingChart(rows: readonly StatRow[], position: StatPosition | null = null): ChartPoint[] {
  const pool = chartPool(rows, position).filter((r) => r.position !== "GKP" && (r.xg > 0 || r.goals > 0));
  const points: ChartPoint[] = pool.map((r) => ({ fplId: r.fplId, x: r.xg, y: r.goals, label: r.webName, sub: sub(r), tone: "base", labelled: false }));
  const n = INSIGHT_CONFIG.stats.chartLabels;
  const gap = (r: StatRow) => r.goals - r.xg;
  const over = [...pool].filter((r) => gap(r) > 0).sort((a, b) => gap(b) - gap(a)).slice(0, n);
  const under = [...pool].filter((r) => gap(r) < 0).sort((a, b) => gap(a) - gap(b)).slice(0, n);
  mark(points, new Set(over.map((r) => r.fplId)), "hi");
  mark(points, new Set(under.map((r) => r.fplId)), "lo");
  return points;
}

/** Value: season points against price. The best points per £m are labelled. */
export function valueChart(rows: readonly StatRow[], position: StatPosition | null = null): ChartPoint[] {
  const pool = chartPool(rows, position);
  const points: ChartPoint[] = pool.map((r) => ({ fplId: r.fplId, x: r.priceM, y: r.totalPoints, label: r.webName, sub: sub(r), tone: "base", labelled: false }));
  const perM = (r: StatRow) => (r.priceM > 0 ? r.totalPoints / r.priceM : 0);
  const best = [...pool].sort((a, b) => perM(b) - perM(a) || b.totalPoints - a.totalPoints).slice(0, INSIGHT_CONFIG.stats.chartLabels + 2);
  mark(points, new Set(best.map((r) => r.fplId)), "hi");
  return points;
}

/**
 * Differentials: form against ownership. The in-form players owned by fewer
 * than `differentialOwnership`% of managers are the story.
 */
export function differentialChart(rows: readonly StatRow[], position: StatPosition | null = null): ChartPoint[] {
  const { differentialOwnership, chartLabels } = INSIGHT_CONFIG.stats;
  // Ownership goes on a log axis, so a floor keeps 0.0% players drawable.
  const pool = chartPool(rows, position).filter((r) => r.form > 0);
  const points: ChartPoint[] = pool.map((r) => ({ fplId: r.fplId, x: Math.max(r.ownership, 0.1), y: r.form, label: r.webName, sub: sub(r), tone: "base", labelled: false }));
  const picks = [...pool].filter((r) => r.ownership < differentialOwnership).sort((a, b) => b.form - a.form || a.ownership - b.ownership).slice(0, chartLabels + 1);
  mark(points, new Set(picks.map((r) => r.fplId)), "hi");
  return points;
}

/** The headline tiles: one leader per measure, with the value it leads on. */
export function statHeadlines(rows: readonly StatRow[]): { id: string; label: string; row: StatRow; value: string }[] {
  const lead = (f: (r: StatRow) => number, pool = rows) => [...pool].sort((a, b) => f(b) - f(a) || b.totalPoints - a.totalPoints)[0];
  const regular = rows.filter((r) => r.minutes >= INSIGHT_CONFIG.stats.minMinutesPer90);
  const out: { id: string; label: string; row: StatRow; value: string }[] = [];
  const add = (id: string, label: string, row: StatRow | undefined, value: (r: StatRow) => string) => row && out.push({ id, label, row, value: value(row) });
  add("goals", "Top scorer", lead((r) => r.goals), (r) => `${r.goals} goals`);
  add("xgi", "Most xGI", lead((r) => r.xgi), (r) => `${r.xgi.toFixed(1)} xGI`);
  add("value", "Best value", lead((r) => r.totalPoints / Math.max(r.priceM, 0.1), regular), (r) => `${(r.totalPoints / r.priceM).toFixed(1)} pts/£m`);
  add("owned", "Most owned", lead((r) => r.ownership), (r) => `${r.ownership.toFixed(1)}%`);
  return out;
}
