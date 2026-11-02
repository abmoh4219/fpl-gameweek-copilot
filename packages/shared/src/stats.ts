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
