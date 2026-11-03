import type { FixtureRunBand } from "./insights/types.ts";

/**
 * The fixture planner: every club's next gameweeks as one grid, built from the
 * published ticker, the engine's fixture runs and the Champions League
 * congestion view. Pure assembly; the difficulty numbers are FPL's own and the
 * run scores are the engine's (both ESTIMATES of how hard a run is).
 */

/** A row of `api.fixture_ticker`. */
export interface TickerViewRow {
  team_fpl_id: number;
  team_short_name: string;
  gameweek: number;
  kickoff_utc: string | null;
  is_home: boolean | null;
  opponent_short_name: string | null;
  difficulty: number | null;
  is_blank: boolean;
}

/** One club's adjusted difficulty from `api.team_runs` (the engine's runs). */
export interface RunScore {
  teamFplId: number;
  teamCode: number;
  next3: number;
  next5: number;
  band3: FixtureRunBand;
  band5: FixtureRunBand;
}

/** A fixture played soon after a Champions League match, by kickoff. */
export interface CongestionMark {
  teamFplId: number;
  kickoffUtc: string;
  daysSinceCl: number | null;
}

export interface GridFixture {
  opponent: string;
  isHome: boolean;
  difficulty: number;
  /** Kicks off soon after a Champions League match. */
  afterCl: boolean;
}

export interface GridCell {
  gameweek: number;
  /** Empty for a blank gameweek; two for a double. */
  fixtures: GridFixture[];
}

export interface GridRow {
  teamFplId: number;
  team: string;
  teamCode: number;
  cells: GridCell[];
  next3: number;
  next5: number;
  band3: FixtureRunBand;
  band5: FixtureRunBand;
}

export type GridSort = "next3" | "next5" | "name";

export function fixtureGrid(ticker: readonly TickerViewRow[], runs: readonly RunScore[], congestion: readonly CongestionMark[] = []): { gameweeks: number[]; rows: GridRow[] } {
  const gameweeks = [...new Set(ticker.map((t) => t.gameweek))].sort((a, b) => a - b);
  const afterCl = new Set(congestion.map((c) => `${c.teamFplId}|${c.kickoffUtc}`));
  const runsByTeam = new Map(runs.map((r) => [r.teamFplId, r]));
  const teams = new Map<number, string>();
  for (const t of ticker) teams.set(t.team_fpl_id, t.team_short_name);

  const rows: GridRow[] = [];
  for (const [teamFplId, team] of teams) {
    const run = runsByTeam.get(teamFplId);
    if (!run) continue;
    const mine = ticker.filter((t) => t.team_fpl_id === teamFplId);
    const cells = gameweeks.map((gameweek) => ({
      gameweek,
      fixtures: mine
        .filter((t) => t.gameweek === gameweek && !t.is_blank && t.opponent_short_name)
        .sort((a, b) => (a.kickoff_utc ?? "").localeCompare(b.kickoff_utc ?? ""))
        .map((t) => ({
          opponent: t.opponent_short_name!,
          isHome: t.is_home === true,
          difficulty: t.difficulty ?? 3,
          afterCl: t.kickoff_utc !== null && afterCl.has(`${teamFplId}|${t.kickoff_utc}`),
        })),
    }));
    rows.push({ teamFplId, team, teamCode: run.teamCode, cells, next3: run.next3, next5: run.next5, band3: run.band3, band5: run.band5 });
  }
  return { gameweeks, rows };
}

/** Easiest run first; ties by name so the order is stable. */
export function sortGrid(rows: readonly GridRow[], by: GridSort): GridRow[] {
  return [...rows].sort((a, b) => (by === "name" ? 0 : a[by] - b[by]) || a.team.localeCompare(b.team));
}

/** A club's season attack and its next-5 run, for the "teams to target" chart. */
export interface TeamTarget {
  teamFplId: number;
  team: string;
  /** Season xG, summed over the club's players. */
  xg: number;
  /** The engine's adjusted difficulty of the next five gameweeks (lower is easier). */
  next5: number;
}

/**
 * Teams to target: attack against fixtures. Each measure is scaled to 0-1
 * across the twenty clubs (most xG = 1, easiest run = 1) and the two are
 * added, so a club must be good at BOTH to lead; adding ranks instead ties a
 * club that is great at one and poor at the other with one good at both.
 */
export function teamTargetChart(teams: readonly TeamTarget[], picks = 5): { fplId: number; x: number; y: number; label: string; sub: string; tone: "base" | "hi"; labelled: boolean }[] {
  const byXg = [...teams].sort((a, b) => b.xg - a.xg).map((t) => t.teamFplId);
  const byRun = [...teams].sort((a, b) => a.next5 - b.next5).map((t) => t.teamFplId);
  const unit = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
  const xs = teams.map((t) => t.xg);
  const runs = teams.map((t) => t.next5);
  const score = (t: TeamTarget) => unit(t.xg, Math.min(...xs), Math.max(...xs)) + unit(-t.next5, -Math.max(...runs), -Math.min(...runs));
  const top = new Set([...teams].sort((a, b) => score(b) - score(a) || a.team.localeCompare(b.team)).slice(0, picks).map((t) => t.teamFplId));
  return teams.map((t) => ({
    fplId: t.teamFplId,
    x: t.xg,
    y: t.next5,
    label: t.team,
    sub: `Attack rank ${byXg.indexOf(t.teamFplId) + 1} · fixtures rank ${byRun.indexOf(t.teamFplId) + 1}`,
    tone: top.has(t.teamFplId) ? "hi" : "base",
    // Twenty clubs: every name fits and every club is a reader's question.
    labelled: true,
  }));
}
