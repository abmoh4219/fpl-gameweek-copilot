import { INSIGHT_CONFIG } from "./insights/config.ts";
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

/** One club's difficulty week by week, and whether its run turns easier. */
export interface FixtureSwing {
  teamFplId: number;
  team: string;
  teamCode: number;
  gameweeks: number[];
  /** Mean FPL difficulty per gameweek (a double averages both); null for a blank. */
  difficulty: (number | null)[];
  /** Mean FPL difficulty of the next two gameweeks, and of the three after; null if all blank. */
  early: number | null;
  late: number | null;
  /** Mean over all five, so a run that "gets easier" can still be seen to be hard overall. */
  overall: number | null;
  /** Early minus late mean difficulty: positive means the run gets easier. */
  swing: number;
  direction: "easier" | "harder" | "steady";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Fixture swings: compare the next two gameweeks with the three after. This
 * describes CHANGE in FPL's own difficulty rating, not how easy a run is: a
 * club can "get easier" and still face a hard five (hence `overall`). It is
 * never transfer advice. A
 * swing smaller than `swingSteadyBelow` in the config (FPL difficulty points) is "steady".
 * Blanks are skipped in the means, not counted as easy or hard.
 */
export function fixtureSwings(rows: readonly GridRow[], steadyBelow: number = INSIGHT_CONFIG.stats.swingSteadyBelow): FixtureSwing[] {
  return rows
    .map((r) => {
      const difficulty = r.cells.map((c) => mean(c.fixtures.map((f) => f.difficulty)));
      const known = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null);
      const early = mean(known(difficulty.slice(0, 2)));
      const late = mean(known(difficulty.slice(2)));
      const overall = mean(known(difficulty));
      const swing = early !== null && late !== null ? Math.round((early - late) * 100) / 100 : 0;
      const direction: FixtureSwing["direction"] = Math.abs(swing) < steadyBelow ? "steady" : swing > 0 ? "easier" : "harder";
      const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
      return {
        teamFplId: r.teamFplId,
        team: r.team,
        teamCode: r.teamCode,
        gameweeks: r.cells.map((c) => c.gameweek),
        difficulty,
        early: r2(early),
        late: r2(late),
        overall: r2(overall),
        swing,
        direction,
      };
    })
    .sort((a, b) => b.swing - a.swing || a.team.localeCompare(b.team));
}
