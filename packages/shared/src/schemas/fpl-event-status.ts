import { z } from "zod";

/**
 * event-status/ — whether a gameweek's points and bonus are final.
 * `points`: "r" = raw/live, "p" = provisional, "c" = confirmed.
 */
export const EventStatusDaySchema = z.object({
  bonus_added: z.boolean(),
  date: z.string(),
  event: z.number(),
  points: z.string(),
});

export const EventStatusSchema = z.object({
  status: z.array(EventStatusDaySchema),
  leagues: z.string(),
});

export type EventStatusDay = z.infer<typeof EventStatusDaySchema>;
export type EventStatus = z.infer<typeof EventStatusSchema>;
