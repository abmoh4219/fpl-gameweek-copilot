import { z } from "zod";

/**
 * entry/{id}/ and entry/{id}/event/{gw}/picks/ — one manager's team.
 * The only live FPL call a website visitor can trigger (CLAUDE.md §7).
 */
export const EntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  player_first_name: z.string(),
  player_last_name: z.string(),
  started_event: z.number(),
  current_event: z.number().nullable(),
  summary_overall_points: z.number().nullable(),
  summary_overall_rank: z.number().nullable(),
  summary_event_points: z.number().nullable(),
  summary_event_rank: z.number().nullable(),
  /** In tenths. */
  last_deadline_value: z.number().nullable(),
  last_deadline_bank: z.number().nullable(),
  last_deadline_total_transfers: z.number().nullable(),
});

export const PickSchema = z.object({
  element: z.number(),
  position: z.number(),
  /** 0 = benched this gameweek, 1 = playing, 2 = captain, 3 = triple captain. */
  multiplier: z.number(),
  is_captain: z.boolean(),
  is_vice_captain: z.boolean(),
  element_type: z.number(),
});

export const EntryHistorySchema = z.object({
  event: z.number(),
  points: z.number(),
  total_points: z.number(),
  overall_rank: z.number().nullable(),
  /** In tenths. */
  bank: z.number(),
  value: z.number(),
  event_transfers: z.number(),
  event_transfers_cost: z.number(),
  points_on_bench: z.number(),
});

export const EntryPicksSchema = z.object({
  active_chip: z.string().nullable(),
  entry_history: EntryHistorySchema,
  picks: z.array(PickSchema),
});

export type Entry = z.infer<typeof EntrySchema>;
export type Pick = z.infer<typeof PickSchema>;
export type EntryPicks = z.infer<typeof EntryPicksSchema>;
