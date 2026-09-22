import { z } from "zod";
import { isoDateTime, numericString } from "./common.ts";

/**
 * bootstrap-static/ — the one FPL call every run depends on.
 *
 * Only the fields we use are modelled; unknown keys are stripped by Zod's
 * default object behaviour, so FPL adding a field never breaks us. A missing
 * or wrong-typed field we DO use fails loudly.
 */

/**
 * Undocumented price-change telemetry (CLAUDE.md §2).
 *
 * `likelihood` is a SIGNED integer, observed in the range -5..+5: it carries
 * direction as well as strength. `projected_percent` is a string like
 * "-42.6". `offset` is 0, 1, 2 — observed as days ahead, to be confirmed.
 */
export const PriceChangeProjectionSchema = z.object({
  offset: z.number(),
  projected_percent: numericString,
  likelihood: z.number(),
});

/**
 * Scout notes attached to a player (e.g. loan ineligibility). Optional
 * enrichment — never allowed to fail a run (CLAUDE.md §10).
 */
export const ScoutRiskSchema = z.object({
  property: z.string(),
  notes: z.string(),
  gameweek: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
});

export const ElementSchema = z.object({
  // identity
  id: z.number(),
  code: z.number(),
  web_name: z.string(),
  first_name: z.string(),
  second_name: z.string(),
  team: z.number(),
  team_code: z.number(),
  element_type: z.number(),

  // availability
  status: z.string(),
  news: z.string(),
  news_added: isoDateTime.nullable(),
  chance_of_playing_this_round: z.number().nullable(),
  chance_of_playing_next_round: z.number().nullable(),

  // price — now_cost stays in tenths
  now_cost: z.number(),
  cost_change_event: z.number(),
  cost_change_start: z.number(),

  // ownership and transfers
  selected_by_percent: numericString,
  transfers_in_event: z.number(),
  transfers_out_event: z.number(),

  // scoring and form
  total_points: z.number(),
  event_points: z.number(),
  form: numericString,
  points_per_game: numericString,
  ep_next: numericString,
  bonus: z.number(),
  bps: z.number(),

  // minutes
  minutes: z.number(),
  starts: z.number(),

  // raw counting stats
  goals_scored: z.number(),
  assists: z.number(),
  clean_sheets: z.number(),
  goals_conceded: z.number(),
  defensive_contribution: z.number(),

  // ICT — strings
  influence: numericString,
  creativity: numericString,
  threat: numericString,
  ict_index: numericString,

  // expected stats — season totals are strings, per-90 are numbers
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,
  expected_goals_per_90: z.number(),
  expected_assists_per_90: z.number(),
  expected_goal_involvements_per_90: z.number(),
  expected_goals_conceded_per_90: z.number(),
  defensive_contribution_per_90: z.number(),

  // set pieces — null when the player is not on duty
  penalties_order: z.number().nullable(),
  corners_and_indirect_freekicks_order: z.number().nullable(),
  direct_freekicks_order: z.number().nullable(),

  // --- optional enrichment: must never fail a run (CLAUDE.md §10) ---
  price_change_percent: numericString.nullable().optional(),
  price_change_hourly_rate: z.number().nullable().optional(),
  price_change_projections: z.array(PriceChangeProjectionSchema).optional(),
  price_change_locked_until: isoDateTime.nullable().optional(),
  price_change_calibrating: z.boolean().nullable().optional(),
  scout_risks: z.array(ScoutRiskSchema).optional(),
});

export const TeamSchema = z.object({
  id: z.number(),
  code: z.number(),
  name: z.string(),
  short_name: z.string(),
  /**
   * Observed null for ALL 20 teams in the Phase 1 sample, along with `form`
   * and `team_division`. Use the granular strength_* fields below, which are
   * populated, and FPL's own fixture difficulty — not this.
   */
  strength: z.number().nullable(),
  strength_overall_home: z.number(),
  strength_overall_away: z.number(),
  strength_attack_home: z.number(),
  strength_attack_away: z.number(),
  strength_defence_home: z.number(),
  strength_defence_away: z.number(),
});

export const EventSchema = z.object({
  id: z.number(),
  name: z.string(),
  deadline_time: isoDateTime,
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_previous: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  average_entry_score: z.number(),
  highest_score: z.number().nullable(),
  most_selected: z.number().nullable(),
  most_captained: z.number().nullable(),
  most_transferred_in: z.number().nullable(),
  top_element: z.number().nullable(),
  transfers_made: z.number(),
});

export const ElementTypeSchema = z.object({
  id: z.number(),
  singular_name_short: z.string(),
  plural_name: z.string(),
});

export const BootstrapStaticSchema = z.object({
  events: z.array(EventSchema),
  teams: z.array(TeamSchema),
  elements: z.array(ElementSchema),
  element_types: z.array(ElementTypeSchema),
  total_players: z.number(),
});

export type PriceChangeProjection = z.infer<typeof PriceChangeProjectionSchema>;
export type ScoutRisk = z.infer<typeof ScoutRiskSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Event = z.infer<typeof EventSchema>;
export type ElementType = z.infer<typeof ElementTypeSchema>;
export type BootstrapStatic = z.infer<typeof BootstrapStaticSchema>;

/** The price-change fields are undocumented and may vanish without notice. */
export function hasPriceChangeFields(element: Element): boolean {
  return (
    element.price_change_percent !== undefined &&
    element.price_change_hourly_rate !== undefined &&
    element.price_change_projections !== undefined
  );
}
