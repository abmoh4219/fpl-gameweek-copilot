import { cache } from "react";
import type { CardRow, SiteCard } from "@fpl/shared";
import { readView } from "./supabase";

/**
 * Every published player card, read ONCE and shared by every visitor through
 * the fetch cache (ADR-0017). Squads, the Gaffer's checks and the transfer
 * market all look players up here, so Supabase egress stays flat however many
 * managers open their team: ~1.4 MB per refresh, under the cache's 2 MB item
 * limit, refreshed every 3 hours to match the pipeline.
 */
const CARDS_TTL = 3 * 3600;

/** Memoised per request too: a page that loads a squad and runs the Gaffer parses the set once. */
export const allCards = cache(async (): Promise<Map<number, CardRow>> => {
  const rows = await readView<{ fpl_id: number; team_code: number; card: SiteCard }>("player_cards", "select=fpl_id,team_code,card", CARDS_TTL);
  return new Map(rows.filter((r) => r.card?.version === 1).map((r) => [r.fpl_id, { card: r.card, teamCode: r.team_code }]));
});

/** Gameweek and season points for every player: small, so it refreshes hourly for live gameweeks. */
export const allPoints = cache(async (): Promise<Map<number, { event: number; total: number }>> => {
  const rows = await readView<{ fpl_id: number; event_points: number | null; total_points: number | null }>(
    "player_current",
    "select=fpl_id,event_points,total_points",
    3600,
  );
  return new Map(rows.map((r) => [r.fpl_id, { event: r.event_points ?? 0, total: r.total_points ?? 0 }]));
});
