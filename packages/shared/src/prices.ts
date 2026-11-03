import type { StatPosition } from "./stats.ts";
import { POSITION_BY_TYPE } from "./squad.ts";

/**
 * The price watch page: who is closest to a rise or a fall, from FPL's own
 * price-change fields, and the changes already confirmed.
 *
 * Rules from CLAUDE.md §2 and §4c:
 * - Direction comes ONLY from price_change_percent (via `direction`).
 * - Crossing 100% is never presented as a confirmed change.
 * - hourly_rate and momentum are experimental and never reach a page: the
 *   columns below are an allow-list and do not include them.
 * - Everything forward-looking is an ESTIMATE.
 */

/** The only price_watch columns the site reads. */
export const PRICE_WATCH_COLUMNS = [
  "fpl_id", "web_name", "element_type", "team_short_name", "price_m", "price_change_percent", "direction",
  "strongest_likelihood", "is_locked", "is_calibrating",
] as const;

export type PriceWatchViewRow = Record<(typeof PRICE_WATCH_COLUMNS)[number], string | number | boolean | null>;

export interface WatchRow {
  fplId: number;
  webName: string;
  team: string;
  position: StatPosition;
  priceM: number;
  /** Signed: positive toward a rise, negative toward a fall. */
  percent: number;
  direction: "rising" | "falling";
  /** FPL's projection, 1-5, in the row's direction. */
  strength: number;
  /** Past 100% without a change: FPL has not moved the price (yet). */
  overThreshold: boolean;
  locked: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function watchRowFromView(r: PriceWatchViewRow): WatchRow | null {
  const position = POSITION_BY_TYPE[num(r.element_type) as 1 | 2 | 3 | 4] as StatPosition | undefined;
  if (!position || (r.direction !== "rising" && r.direction !== "falling") || typeof r.web_name !== "string") return null;
  const percent = num(r.price_change_percent);
  return {
    fplId: num(r.fpl_id),
    webName: r.web_name,
    team: String(r.team_short_name ?? ""),
    position,
    priceM: num(r.price_m),
    percent,
    direction: r.direction,
    // The likelihood is signed (-5..+5); only its strength in the row's own direction is shown.
    strength: Math.min(5, Math.max(0, r.direction === "rising" ? num(r.strongest_likelihood) : -num(r.strongest_likelihood))),
    overThreshold: Math.abs(percent) > 100,
    locked: r.is_locked === true,
  };
}

/** The players closest to a change in one direction, closest first. */
export function closestToChange(rows: readonly WatchRow[], direction: "rising" | "falling", position: StatPosition | null = null, limit = 15): WatchRow[] {
  return rows
    .filter((r) => r.direction === direction && (!position || r.position === position))
    .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent) || a.webName.localeCompare(b.webName))
    .slice(0, limit);
}

/** A confirmed change, from `api.price_changes_daily`. */
export interface ChangeViewRow {
  fpl_id: number;
  web_name: string;
  element_type: number;
  team_short_name: string;
  changed_on: string;
  change_m: number;
  price_m: number;
  direction: "rise" | "fall";
}

export interface ChangeDay {
  date: string;
  rises: ChangeViewRow[];
  falls: ChangeViewRow[];
}

/** Confirmed changes grouped by night, newest first; the biggest moves first within a night. */
export function changeDays(rows: readonly ChangeViewRow[], days = 7): ChangeDay[] {
  const byDate = new Map<string, ChangeViewRow[]>();
  for (const r of rows) byDate.set(r.changed_on, [...(byDate.get(r.changed_on) ?? []), r]);
  const order = (a: ChangeViewRow, b: ChangeViewRow) => Math.abs(b.change_m) - Math.abs(a.change_m) || b.price_m - a.price_m || a.web_name.localeCompare(b.web_name);
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, days)
    .map(([date, list]) => ({
      date,
      rises: list.filter((r) => r.direction === "rise").sort(order),
      falls: list.filter((r) => r.direction === "fall").sort(order),
    }));
}
