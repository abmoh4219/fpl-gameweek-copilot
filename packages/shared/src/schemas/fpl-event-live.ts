import { z } from "zod";
import { numericString } from "./common.ts";

/**
 * event/{gw}/live/ — per-gameweek stats for EVERY player in ONE call.
 *
 * Confirmed in Phase 1: this endpoint DOES carry per-player expected stats
 * (expected_goals, expected_assists, expected_goal_involvements,
 * expected_goals_conceded), all as strings. That is why we never sweep
 * element-summary for the whole squad list (CLAUDE.md §5).
 */
export const LiveStatsSchema = z.object({
  minutes: z.number(),
  goals_scored: z.number(),
  assists: z.number(),
  clean_sheets: z.number(),
  goals_conceded: z.number(),
  own_goals: z.number(),
  penalties_saved: z.number(),
  penalties_missed: z.number(),
  yellow_cards: z.number(),
  red_cards: z.number(),
  saves: z.number(),
  bonus: z.number(),
  bps: z.number(),
  starts: z.number(),
  defensive_contribution: z.number(),
  total_points: z.number(),
  influence: numericString,
  creativity: numericString,
  threat: numericString,
  ict_index: numericString,
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,
});

export const LiveElementSchema = z.object({
  id: z.number(),
  stats: LiveStatsSchema,
});

export const EventLiveSchema = z.object({
  elements: z.array(LiveElementSchema),
});

export type LiveStats = z.infer<typeof LiveStatsSchema>;
export type LiveElement = z.infer<typeof LiveElementSchema>;
export type EventLive = z.infer<typeof EventLiveSchema>;
