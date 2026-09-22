import { INSIGHT_CONFIG } from "./config.ts";
import type { PlayerFormRow } from "./types.ts";

export interface FormInsight {
  gameweeks: number;
  points: number;
  minutes: number;
  starts: number;
  xgiPer90: number;
  /** 0-100, blending points and minutes over the last 4 gameweeks. */
  score: number;
}

/**
 * Recent form over the last 4 finished gameweeks.
 *
 * Minutes are part of the score, not just points: four hauls off the bench
 * and four quiet starts are very different bets going forward.
 */
export function formInsight(row: PlayerFormRow | undefined): FormInsight {
  const { pointsForFullScore, minutesForFullScore } = INSIGHT_CONFIG.form;

  if (!row) {
    return { gameweeks: 0, points: 0, minutes: 0, starts: 0, xgiPer90: 0, score: 0 };
  }

  const pointsPart = clamp01(row.pointsLast4 / pointsForFullScore);
  const minutesPart = clamp01(row.minutesLast4 / minutesForFullScore);

  return {
    gameweeks: row.gameweeksLast4,
    points: row.pointsLast4,
    minutes: row.minutesLast4,
    starts: row.startsLast4,
    xgiPer90: round(row.xgiPer90Last4, 2),
    score: Math.round((pointsPart * 0.7 + minutesPart * 0.3) * 100),
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
