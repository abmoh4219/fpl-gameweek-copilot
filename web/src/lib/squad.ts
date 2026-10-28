import { buildSquad, type CardRow, type SiteCard, type Squad } from "@fpl/shared";
import { fetchEntry, fetchPicks } from "./fpl";
import { readView } from "./supabase";

interface CardViewRow {
  fpl_id: number;
  team_code: number;
  card: SiteCard;
}

/** Load a manager's squad: two cached FPL calls, two cached view reads. */
export async function loadSquad(teamId: number): Promise<Squad> {
  const entry = await fetchEntry(teamId);
  if (entry.current_event === null) {
    throw new Error("This team has not played a gameweek yet");
  }
  const picks = await fetchPicks(teamId, entry.current_event);
  const ids = picks.picks.map((p) => p.element).join(",");

  const [cardRows, pointRows] = await Promise.all([
    readView<CardViewRow>("player_cards", `select=fpl_id,team_code,card&fpl_id=in.(${ids})`),
    readView<{ fpl_id: number; event_points: number | null; total_points: number | null }>(
      "player_current",
      `select=fpl_id,event_points,total_points&fpl_id=in.(${ids})`,
    ),
  ]);

  const cards = new Map<number, CardRow>(
    cardRows
      .filter((r) => r.card?.version === 1)
      .map((r) => [r.fpl_id, { card: r.card, teamCode: r.team_code }]),
  );
  const eventPoints = new Map(pointRows.map((r) => [r.fpl_id, r.event_points ?? 0]));
  const seasonPoints = new Map(pointRows.map((r) => [r.fpl_id, r.total_points ?? 0]));

  return buildSquad({ entry, picks, cards, eventPoints, seasonPoints });
}
