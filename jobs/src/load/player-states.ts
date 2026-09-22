import type { PlayerState } from "@fpl/shared";
import type { Db } from "../db.ts";

/**
 * The stored side of change detection: rebuild each player's last known state
 * from snapshots, in exactly the shape the pure detectors compare.
 */

interface StateRow {
  fpl_id: number;
  web_name: string;
  now_cost: number;
  status: string;
  news: string;
  selected_by_percent: number;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
}

function toState(row: StateRow): PlayerState {
  return {
    fplId: Number(row.fpl_id),
    webName: row.web_name,
    nowCost: Number(row.now_cost),
    status: row.status,
    news: row.news,
    selectedByPercent: Number(row.selected_by_percent),
    penaltiesOrder: row.penalties_order,
    cornersOrder: row.corners_and_indirect_freekicks_order,
    freekicksOrder: row.direct_freekicks_order,
  };
}

/**
 * Latest snapshot per player, including today's. This is what intraday
 * status/news detection compares against, so that price-sync running every
 * 3 hours does not re-report the same injury eight times.
 */
export async function fetchLatestPlayerStates(
  db: Db,
  seasonId: number,
): Promise<Map<number, PlayerState>> {
  const rows = await db<StateRow[]>`
    select distinct on (p.id)
      p.fpl_id, p.web_name, s.now_cost, s.status, s.news, s.selected_by_percent,
      s.penalties_order, s.corners_and_indirect_freekicks_order, s.direct_freekicks_order
    from core.players p
    join core.player_snapshots s on s.player_id = p.id
    where p.season_id = ${seasonId}
    order by p.id, s.snapshot_date desc
  `;
  return new Map(rows.map((r) => [Number(r.fpl_id), toState(r)]));
}

/**
 * Latest snapshot per player STRICTLY BEFORE the given UK date — yesterday's
 * state. Day-over-day changes (price, ownership, set pieces) compare against
 * this, so an intraday snapshot written earlier today cannot mask them.
 */
export async function fetchPlayerStatesBefore(
  db: Db,
  seasonId: number,
  date: string,
): Promise<Map<number, PlayerState>> {
  const rows = await db<StateRow[]>`
    select distinct on (p.id)
      p.fpl_id, p.web_name, s.now_cost, s.status, s.news, s.selected_by_percent,
      s.penalties_order, s.corners_and_indirect_freekicks_order, s.direct_freekicks_order
    from core.players p
    join core.player_snapshots s on s.player_id = p.id
    where p.season_id = ${seasonId} and s.snapshot_date < ${date}::date
    order by p.id, s.snapshot_date desc
  `;
  return new Map(rows.map((r) => [Number(r.fpl_id), toState(r)]));
}
