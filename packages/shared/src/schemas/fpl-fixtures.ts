import { z } from "zod";
import { isoDateTime } from "./common.ts";

/**
 * fixtures/ — Premier League fixtures and FPL's own difficulty ratings.
 * Premier League fixtures ALWAYS come from here, never from football-data
 * (CLAUDE.md §6).
 */
export const FixtureSchema = z.object({
  id: z.number(),
  code: z.number(),
  /** null when the fixture has not been assigned to a gameweek yet. */
  event: z.number().nullable(),
  team_h: z.number(),
  team_a: z.number(),
  team_h_score: z.number().nullable(),
  team_a_score: z.number().nullable(),
  /** FPL difficulty, 1 (easiest) to 5 (hardest). */
  team_h_difficulty: z.number(),
  team_a_difficulty: z.number(),
  kickoff_time: isoDateTime.nullable(),
  started: z.boolean().nullable(),
  finished: z.boolean(),
  minutes: z.number(),
});

export const FixturesSchema = z.array(FixtureSchema);

export type Fixture = z.infer<typeof FixtureSchema>;
