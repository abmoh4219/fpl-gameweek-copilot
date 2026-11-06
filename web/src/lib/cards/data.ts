import {
  fixtureGrid,
  PRICE_WATCH_COLUMNS,
  STAT_COLUMNS,
  statRowFromView,
  watchRowFromView,
  type GridRow,
  type PriceWatchViewRow,
  type RunScore,
  type StatRow,
  type StatViewRow,
  type TeamRun,
  type TickerViewRow,
  type WatchRow,
} from "@fpl/shared";
import { allCards } from "../cards";
import { readView } from "../supabase";
import type { FixtureChip } from "./frame";

/**
 * The reads behind the shareable cards and the deadline countdown. All of
 * them are shared, cached view reads: a card costs the same for one visitor
 * or ten thousand, and never calls FPL (ADR-0019).
 */

export async function statRows(): Promise<{ rows: StatRow[]; date: string | null }> {
  const raw = await readView<StatViewRow & { snapshot_date: string }>("player_current", `select=${STAT_COLUMNS.join(",")},snapshot_date`, 3600).catch(() => []);
  return { rows: raw.flatMap((r) => statRowFromView(r) ?? []), date: raw[0]?.snapshot_date ?? null };
}

export async function watchRows(): Promise<WatchRow[]> {
  const raw = await readView<PriceWatchViewRow>("price_watch", `select=${PRICE_WATCH_COLUMNS.join(",")}&direction=neq.stable`, 1800).catch(() => []);
  return raw.flatMap((r) => watchRowFromView(r) ?? []);
}

export interface Deadline {
  gameweek: number;
  deadlineUtc: string;
}

/** The upcoming deadlines (the ticker's horizon), earliest first. The caller picks the first still in the future. */
export async function deadlines(): Promise<Deadline[]> {
  const rows = await readView<{ gameweek: number; deadline_utc: string; team_fpl_id: number }>(
    "fixture_ticker",
    "select=gameweek,deadline_utc,team_fpl_id&order=team_fpl_id,gameweek&limit=8",
    1800,
  ).catch(() => []);
  const first = rows[0]?.team_fpl_id;
  const seen = new Map<number, string>();
  for (const r of rows) if (r.team_fpl_id === first && !seen.has(r.gameweek)) seen.set(r.gameweek, r.deadline_utc);
  return [...seen].map(([gameweek, deadlineUtc]) => ({ gameweek, deadlineUtc }));
}

/** The next deadline from a given moment, or null in the off-season. */
export function nextDeadline(list: readonly Deadline[], now: Date): Deadline | null {
  return list.find((d) => new Date(d.deadlineUtc).getTime() > now.getTime()) ?? null;
}

/** FPL's average score and whether the gameweek is finished; null before the view exists or if unavailable. */
export async function gameweekInfo(gameweek: number): Promise<{ average: number | null; finished: boolean } | null> {
  const rows = await readView<{ average_entry_score: number | null; finished: boolean }>(
    "gameweeks",
    `select=average_entry_score,finished&gameweek=eq.${gameweek}`,
    1800,
  ).catch(() => []);
  const r = rows[0];
  // FPL reports 0 until the gameweek is scored: that is "not known yet", not an average of nothing.
  return r ? { average: r.average_entry_score && r.average_entry_score > 0 ? r.average_entry_score : null, finished: r.finished } : null;
}

/** "6 November" — how the cards date their data. */
export function dayLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** The next `n` fixtures for some players, as card chips, from the shared card read (no extra query). */
export async function fixturesFor(ids: readonly number[], n = 3): Promise<Record<number, FixtureChip[]>> {
  const cards = await allCards();
  const out: Record<number, FixtureChip[]> = {};
  for (const id of ids) {
    out[id] = (cards.get(id)?.card.fixturesLong.fixtures ?? []).slice(0, n).map((f) => ({
      gameweek: f.gameweek,
      label: f.isBlank || !f.opponent ? "–" : f.isHome ? f.opponent : f.opponent.toLowerCase(),
      difficulty: f.isBlank ? null : f.difficulty,
    }));
  }
  return out;
}

/** Every club's next five gameweeks as the fixtures page builds them (without congestion marks, which no card shows). */
export async function fixtureGridData(): Promise<{ gameweeks: number[]; rows: GridRow[] }> {
  const [ticker, runRows] = await Promise.all([
    readView<TickerViewRow>(
      "fixture_ticker",
      "select=team_fpl_id,team_short_name,gameweek,kickoff_utc,is_home,opponent_short_name,difficulty,is_blank&order=gameweek",
      3600,
    ).catch(() => []),
    readView<{ team_fpl_id: number; team_code: number; run: TeamRun }>("team_runs", "select=team_fpl_id,team_code,run", 3600).catch(() => []),
  ]);
  const runs: RunScore[] = runRows
    .filter((r) => r.run?.short && r.run?.long)
    .map((r) => ({ teamFplId: r.team_fpl_id, teamCode: r.team_code, next3: r.run.short.adjustedDifficulty, next5: r.run.long.adjustedDifficulty, band3: r.run.short.band, band5: r.run.long.band }));
  return fixtureGrid(ticker, runs);
}

/**
 * The latest gameweek with points, and every player's points in it. Uses the
 * finished flag from api.gameweeks when that view exists, else the latest
 * gameweek the stats cover.
 */
export async function latestGameweekPoints(): Promise<{ gameweek: number; finished: boolean; points: Map<number, number> } | null> {
  const done = await readView<{ gameweek: number }>("gameweeks", "select=gameweek&finished=is.true&order=gameweek.desc&limit=1", 1800).catch(() => []);
  const latest = done[0]?.gameweek ?? (await readView<{ gameweek: number }>("player_gameweeks", "select=gameweek&order=gameweek.desc&limit=1", 1800).catch(() => []))[0]?.gameweek;
  if (!latest) return null;
  const rows = await readView<{ fpl_id: number; total_points: number }>("player_gameweeks", `select=fpl_id,total_points&gameweek=eq.${latest}`, 3600).catch(() => []);
  const points = new Map<number, number>();
  for (const r of rows) points.set(r.fpl_id, (points.get(r.fpl_id) ?? 0) + r.total_points);
  return { gameweek: latest, finished: done.length > 0, points };
}
