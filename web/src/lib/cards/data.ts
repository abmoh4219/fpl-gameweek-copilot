import {
  PRICE_WATCH_COLUMNS,
  STAT_COLUMNS,
  statRowFromView,
  watchRowFromView,
  type PriceWatchViewRow,
  type StatRow,
  type StatViewRow,
  type WatchRow,
} from "@fpl/shared";
import { readView } from "../supabase";

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

/** "6 November" — how the cards date their data. */
export function dayLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
