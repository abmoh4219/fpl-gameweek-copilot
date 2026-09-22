import type { EventLive } from "@fpl/shared";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Per-gameweek stats for every player, from ONE event/{gw}/live call.
 *
 * FPL already aggregates a double gameweek into a single stats object; the
 * per-fixture breakdown lives in `explain`, which we keep as fixture_detail
 * (~127 bytes a row) so a double can still be broken apart later.
 */
export async function loadPlayerGameweekStats(
  ctx: LoadContext,
  live: EventLive,
  fplEventId: number,
  dryRun = false,
): Promise<LoadResult> {
  const gameweekId = ctx.gameweekIds.get(fplEventId);
  if (gameweekId === undefined) throw new Error(`Unknown gameweek ${fplEventId}`);

  const rows = live.elements.flatMap((el) => {
    const playerId = ctx.playerIds.get(el.id);
    // A player can appear in live data before bootstrap lists them; skip
    // rather than fail the whole run.
    if (playerId === undefined) return [];
    const s = el.stats;
    return [
      {
        player_id: playerId,
        gameweek_id: gameweekId,
        minutes: s.minutes,
        starts: s.starts,
        goals_scored: s.goals_scored,
        assists: s.assists,
        clean_sheets: s.clean_sheets,
        goals_conceded: s.goals_conceded,
        own_goals: s.own_goals,
        penalties_saved: s.penalties_saved,
        penalties_missed: s.penalties_missed,
        yellow_cards: s.yellow_cards,
        red_cards: s.red_cards,
        saves: s.saves,
        bonus: s.bonus,
        bps: s.bps,
        defensive_contribution: s.defensive_contribution,
        total_points: s.total_points,
        influence: s.influence,
        creativity: s.creativity,
        threat: s.threat,
        ict_index: s.ict_index,
        expected_goals: s.expected_goals,
        expected_assists: s.expected_assists,
        expected_goal_involvements: s.expected_goal_involvements,
        expected_goals_conceded: s.expected_goals_conceded,
        fixture_detail: ctx.db.json(el.explain as never),
      },
    ];
  });

  if (dryRun) return { table: "player_gameweek_stats", rows: rows.length };

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.player_gameweek_stats ${ctx.db(
        batch,
        "player_id", "gameweek_id", "minutes", "starts", "goals_scored",
        "assists", "clean_sheets", "goals_conceded", "own_goals",
        "penalties_saved", "penalties_missed", "yellow_cards", "red_cards",
        "saves", "bonus", "bps", "defensive_contribution", "total_points",
        "influence", "creativity", "threat", "ict_index", "expected_goals",
        "expected_assists", "expected_goal_involvements",
        "expected_goals_conceded", "fixture_detail",
      )}
      on conflict (player_id, gameweek_id) do update set
        minutes                    = excluded.minutes,
        starts                     = excluded.starts,
        goals_scored               = excluded.goals_scored,
        assists                    = excluded.assists,
        clean_sheets               = excluded.clean_sheets,
        goals_conceded             = excluded.goals_conceded,
        own_goals                  = excluded.own_goals,
        penalties_saved            = excluded.penalties_saved,
        penalties_missed           = excluded.penalties_missed,
        yellow_cards               = excluded.yellow_cards,
        red_cards                  = excluded.red_cards,
        saves                      = excluded.saves,
        bonus                      = excluded.bonus,
        bps                        = excluded.bps,
        defensive_contribution     = excluded.defensive_contribution,
        total_points               = excluded.total_points,
        influence                  = excluded.influence,
        creativity                 = excluded.creativity,
        threat                     = excluded.threat,
        ict_index                  = excluded.ict_index,
        expected_goals             = excluded.expected_goals,
        expected_assists           = excluded.expected_assists,
        expected_goal_involvements = excluded.expected_goal_involvements,
        expected_goals_conceded    = excluded.expected_goals_conceded,
        fixture_detail             = excluded.fixture_detail,
        updated_at                 = now()
    `;
  }

  return { table: "player_gameweek_stats", rows: rows.length };
}
