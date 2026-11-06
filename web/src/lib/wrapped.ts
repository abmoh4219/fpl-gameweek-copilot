import { gameweekWrapped, type GameweekWrapped, type Squad } from "@fpl/shared";
import { gameweekInfo } from "./cards/data";
import { fetchSeason } from "./fpl";
import { loadSquad } from "./squad";

/**
 * One manager's gameweek, wrapped (ADR-0020). The squad comes from the cached
 * entry and picks; the history adds last gameweek's rank. Both are optional
 * extras: without them the card still tells the gameweek.
 */
export async function wrappedFor(id: number): Promise<{ squad: Squad; wrapped: GameweekWrapped; finished: boolean }> {
  const squad = await loadSquad(id);
  const [season, info] = await Promise.all([fetchSeason(id).catch(() => null), gameweekInfo(squad.gameweek)]);
  const previous = season?.current.find((h) => h.event === squad.gameweek - 1)?.overall_rank ?? null;
  return { squad, wrapped: gameweekWrapped(squad, { average: info?.average ?? null, previousOverallRank: previous }), finished: info?.finished ?? true };
}
