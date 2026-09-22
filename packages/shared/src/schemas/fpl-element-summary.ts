import { z } from "zod";
import { isoDateTime, numericString } from "./common.ts";

/**
 * element-summary/{id}/ — per-player history and upcoming fixtures.
 * Only fetched for a SMALL set of players of interest (CLAUDE.md §5).
 */
export const HistoryEntrySchema = z.object({
  element: z.number(),
  fixture: z.number(),
  opponent_team: z.number(),
  round: z.number(),
  was_home: z.boolean(),
  kickoff_time: isoDateTime.nullable(),
  total_points: z.number(),
  minutes: z.number(),
  starts: z.number(),
  goals_scored: z.number(),
  assists: z.number(),
  clean_sheets: z.number(),
  goals_conceded: z.number(),
  bonus: z.number(),
  bps: z.number(),
  defensive_contribution: z.number(),
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,
  /** Player price at the time, in tenths. */
  value: z.number(),
  selected: z.number(),
  transfers_balance: z.number(),
  transfers_in: z.number(),
  transfers_out: z.number(),
});

export const UpcomingFixtureSchema = z.object({
  id: z.number(),
  code: z.number(),
  event: z.number().nullable(),
  team_h: z.number(),
  team_a: z.number(),
  is_home: z.boolean(),
  /** FPL difficulty for THIS player's team, 1-5. */
  difficulty: z.number(),
  kickoff_time: isoDateTime.nullable(),
  finished: z.boolean(),
});

export const ElementSummarySchema = z.object({
  history: z.array(HistoryEntrySchema),
  fixtures: z.array(UpcomingFixtureSchema),
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type UpcomingFixture = z.infer<typeof UpcomingFixtureSchema>;
export type ElementSummary = z.infer<typeof ElementSummarySchema>;
