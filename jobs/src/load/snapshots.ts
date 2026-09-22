import type { BootstrapStatic } from "@fpl/shared";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * One row per player per day. Re-running on the same date overwrites that
 * day's row rather than creating a second one.
 */
export async function loadPlayerSnapshots(
  ctx: LoadContext,
  bootstrap: BootstrapStatic,
  snapshotDate: string,
): Promise<LoadResult> {
  const rows = bootstrap.elements.map((e) => {
    const playerId = ctx.playerIds.get(e.id);
    if (playerId === undefined) throw new Error(`Unknown player ${e.id} (${e.web_name})`);
    return {
      player_id: playerId,
      snapshot_date: snapshotDate,
      now_cost: e.now_cost,
      cost_change_event: e.cost_change_event,
      cost_change_start: e.cost_change_start,
      status: e.status,
      news: e.news,
      news_added: e.news_added,
      chance_of_playing_next_round: e.chance_of_playing_next_round,
      chance_of_playing_this_round: e.chance_of_playing_this_round,
      selected_by_percent: e.selected_by_percent,
      transfers_in_event: e.transfers_in_event,
      transfers_out_event: e.transfers_out_event,
      total_points: e.total_points,
      event_points: e.event_points,
      form: e.form,
      points_per_game: e.points_per_game,
      ep_next: e.ep_next,
      bonus: e.bonus,
      bps: e.bps,
      minutes: e.minutes,
      starts: e.starts,
      goals_scored: e.goals_scored,
      assists: e.assists,
      clean_sheets: e.clean_sheets,
      goals_conceded: e.goals_conceded,
      defensive_contribution: e.defensive_contribution,
      defensive_contribution_per_90: e.defensive_contribution_per_90,
      influence: e.influence,
      creativity: e.creativity,
      threat: e.threat,
      ict_index: e.ict_index,
      expected_goals: e.expected_goals,
      expected_assists: e.expected_assists,
      expected_goal_involvements: e.expected_goal_involvements,
      expected_goals_conceded: e.expected_goals_conceded,
      expected_goals_per_90: e.expected_goals_per_90,
      expected_assists_per_90: e.expected_assists_per_90,
      expected_goal_involvements_per_90: e.expected_goal_involvements_per_90,
      expected_goals_conceded_per_90: e.expected_goals_conceded_per_90,
      penalties_order: e.penalties_order,
      corners_and_indirect_freekicks_order: e.corners_and_indirect_freekicks_order,
      direct_freekicks_order: e.direct_freekicks_order,
    };
  });

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.player_snapshots ${ctx.db(
        batch,
        "player_id", "snapshot_date", "now_cost", "cost_change_event",
        "cost_change_start", "status", "news", "news_added",
        "chance_of_playing_next_round", "chance_of_playing_this_round",
        "selected_by_percent", "transfers_in_event", "transfers_out_event",
        "total_points", "event_points", "form", "points_per_game", "ep_next",
        "bonus", "bps", "minutes", "starts", "goals_scored", "assists",
        "clean_sheets", "goals_conceded", "defensive_contribution",
        "defensive_contribution_per_90", "influence", "creativity", "threat",
        "ict_index", "expected_goals", "expected_assists",
        "expected_goal_involvements", "expected_goals_conceded",
        "expected_goals_per_90", "expected_assists_per_90",
        "expected_goal_involvements_per_90", "expected_goals_conceded_per_90",
        "penalties_order", "corners_and_indirect_freekicks_order",
        "direct_freekicks_order",
      )}
      on conflict (player_id, snapshot_date) do update set
        now_cost                             = excluded.now_cost,
        cost_change_event                    = excluded.cost_change_event,
        cost_change_start                    = excluded.cost_change_start,
        status                               = excluded.status,
        news                                 = excluded.news,
        news_added                           = excluded.news_added,
        chance_of_playing_next_round         = excluded.chance_of_playing_next_round,
        chance_of_playing_this_round         = excluded.chance_of_playing_this_round,
        selected_by_percent                  = excluded.selected_by_percent,
        transfers_in_event                   = excluded.transfers_in_event,
        transfers_out_event                  = excluded.transfers_out_event,
        total_points                         = excluded.total_points,
        event_points                         = excluded.event_points,
        form                                 = excluded.form,
        points_per_game                      = excluded.points_per_game,
        ep_next                              = excluded.ep_next,
        bonus                                = excluded.bonus,
        bps                                  = excluded.bps,
        minutes                              = excluded.minutes,
        starts                               = excluded.starts,
        goals_scored                         = excluded.goals_scored,
        assists                              = excluded.assists,
        clean_sheets                         = excluded.clean_sheets,
        goals_conceded                       = excluded.goals_conceded,
        defensive_contribution               = excluded.defensive_contribution,
        defensive_contribution_per_90        = excluded.defensive_contribution_per_90,
        influence                            = excluded.influence,
        creativity                           = excluded.creativity,
        threat                               = excluded.threat,
        ict_index                            = excluded.ict_index,
        expected_goals                       = excluded.expected_goals,
        expected_assists                     = excluded.expected_assists,
        expected_goal_involvements           = excluded.expected_goal_involvements,
        expected_goals_conceded              = excluded.expected_goals_conceded,
        expected_goals_per_90                = excluded.expected_goals_per_90,
        expected_assists_per_90              = excluded.expected_assists_per_90,
        expected_goal_involvements_per_90    = excluded.expected_goal_involvements_per_90,
        expected_goals_conceded_per_90       = excluded.expected_goals_conceded_per_90,
        penalties_order                      = excluded.penalties_order,
        corners_and_indirect_freekicks_order = excluded.corners_and_indirect_freekicks_order,
        direct_freekicks_order               = excluded.direct_freekicks_order
    `;
  }

  return { table: "player_snapshots", rows: rows.length };
}
