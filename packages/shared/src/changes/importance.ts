import type { ChangeType } from "./types.ts";

/**
 * Importance ranks what the alert pipeline should lead with. One formula, one
 * place, unit tested — so tuning it is a deliberate act rather than a stray
 * edit inside a detector.
 *
 *   importance = round(base * ownershipWeight)
 *
 * `price_fall` outranks `price_rise` because a fall costs a holder money now,
 * while a rise is an opportunity they may have missed. A worsening status
 * outranks everything: an injury to a widely owned player before a deadline
 * is the single most valuable thing this product can tell someone.
 */
export const BASE_SCORES = {
  status_change_worse: 60,
  price_fall: 55,
  price_rise: 45,
  set_piece_change: 40,
  status_change_better: 35,
  news_change: 30,
  ownership_move: 25,
} as const;

/**
 * Ownership weight, 1.0 to 5.0.
 *
 * Saturates at 50%: above that the news is already unmissable, and Haaland at
 * 73.6% does not need six times the weight of a 50%-owned player. Ownership in
 * this game is extremely skewed — the median player is owned by 0.2% — so the
 * curve has to reward the handful of players most squads actually hold.
 */
export function ownershipWeight(selectedByPercent: number): number {
  const clamped = Math.max(0, Math.min(selectedByPercent, 50));
  return 1 + clamped / 12.5;
}

export function scoreImportance(base: number, selectedByPercent: number): number {
  return Math.round(base * ownershipWeight(selectedByPercent));
}

/** Availability ranking, used to tell a worsening status from a recovery. */
const STATUS_RANK: Record<string, number> = {
  a: 0, // available
  d: 1, // doubtful
  i: 2, // injured
  s: 2, // suspended
  u: 3, // unavailable
  n: 3, // not in squad
};

export function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 1;
}

export function isWorsening(previous: string, current: string): boolean {
  return statusRank(current) > statusRank(previous);
}

export function baseScoreFor(type: ChangeType, previousStatus: string, currentStatus: string): number {
  switch (type) {
    case "status_change":
      return isWorsening(previousStatus, currentStatus)
        ? BASE_SCORES.status_change_worse
        : BASE_SCORES.status_change_better;
    case "price_fall":
      return BASE_SCORES.price_fall;
    case "price_rise":
      return BASE_SCORES.price_rise;
    case "set_piece_change":
      return BASE_SCORES.set_piece_change;
    case "news_change":
      return BASE_SCORES.news_change;
    case "ownership_move":
      return BASE_SCORES.ownership_move;
  }
}
