import { buildSquad, type CardRow, type Squad } from "@fpl/shared";
import { allCards, allPoints } from "./cards";
import { fetchEntry, fetchPicks } from "./fpl";

/** Load a manager's squad: two cached FPL calls, then two SHARED cached reads (no per-team database read). */
export async function loadSquad(teamId: number): Promise<Squad> {
  const entry = await fetchEntry(teamId);
  if (entry.current_event === null) {
    throw new Error("This team has not played a gameweek yet");
  }
  const picks = await fetchPicks(teamId, entry.current_event);
  const ids = picks.picks.map((p) => p.element);

  const [every, points] = await Promise.all([allCards(), allPoints()]);
  const cards = new Map<number, CardRow>(ids.flatMap((id) => (every.has(id) ? [[id, every.get(id)!] as const] : [])));
  const eventPoints = new Map(ids.map((id) => [id, points.get(id)?.event ?? 0]));
  const seasonPoints = new Map(ids.map((id) => [id, points.get(id)?.total ?? 0]));

  return buildSquad({ entry, picks, cards, eventPoints, seasonPoints });
}
