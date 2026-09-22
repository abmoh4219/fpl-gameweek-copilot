import { z } from "zod";
import { isoDateTime } from "./common.ts";

/**
 * football-data.org — used for ONE thing: Champions League fixture dates for
 * Premier League clubs, to compute the fixture congestion flag.
 *
 * Competition code is CL (id 2001). UCL is the Conference League (CLAUDE.md §6).
 *
 * `tla` is modelled but must NEVER be used for matching: TLAs are not unique
 * (FCB is both Barcelona and Bayern). Map by numeric `id` only.
 */
export const FootballDataTeamRefSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  shortName: z.string().nullable(),
  tla: z.string().nullable(),
});

export const FootballDataTeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  shortName: z.string().nullable(),
  tla: z.string().nullable(),
});

export const FootballDataTeamsSchema = z.object({
  count: z.number(),
  teams: z.array(FootballDataTeamSchema),
});

export const FootballDataMatchSchema = z.object({
  id: z.number(),
  utcDate: isoDateTime,
  /** SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | ... */
  status: z.string(),
  matchday: z.number().nullable(),
  /** LEAGUE_STAGE, PLAYOFFS, LAST_16, ... Knockout rounds appear late. */
  stage: z.string(),
  homeTeam: FootballDataTeamRefSchema,
  awayTeam: FootballDataTeamRefSchema,
});

export const FootballDataMatchesSchema = z.object({
  matches: z.array(FootballDataMatchSchema),
});

export type FootballDataTeam = z.infer<typeof FootballDataTeamSchema>;
export type FootballDataMatch = z.infer<typeof FootballDataMatchSchema>;
export type FootballDataMatches = z.infer<typeof FootballDataMatchesSchema>;
