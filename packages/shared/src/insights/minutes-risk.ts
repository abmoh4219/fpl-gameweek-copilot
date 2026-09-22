import { INSIGHT_CONFIG } from "./config.ts";
import type { CongestionFlags, MinutesRiskBand, PlayerCurrentRow, PlayerFormRow } from "./types.ts";

export interface MinutesRiskInsight {
  band: MinutesRiskBand;
  /** 0-100; higher is riskier. */
  score: number;
  reasons: string[];
}

/**
 * How likely is this player to actually play?
 *
 * Availability status and FPL's own chance_of_playing dominate, with recent
 * minutes and starts as the evidence when there is no news at all. Champions
 * League congestion adds rotation risk on top.
 */
export function minutesRiskInsight(
  player: PlayerCurrentRow,
  form: PlayerFormRow | undefined,
  congestion: CongestionFlags | undefined,
): MinutesRiskInsight {
  const cfg = INSIGHT_CONFIG.minutesRisk;
  const reasons: string[] = [];
  let score = 0;

  const statusPenalty = cfg.statusPenalty[player.status] ?? 0;
  if (statusPenalty > 0) {
    score += statusPenalty;
    reasons.push(`status ${player.status}`);
  }

  // null means "no news", which is not the same as 100% fit but is not a flag.
  if (player.chanceOfPlayingNextRound !== null) {
    for (const rule of cfg.chancePenalty) {
      if (player.chanceOfPlayingNextRound <= rule.atMost) {
        score += rule.penalty;
        reasons.push(`${player.chanceOfPlayingNextRound}% chance of playing`);
        break;
      }
    }
  }

  const minutes = form?.minutesLast4 ?? 0;
  for (const rule of cfg.minutesPenalty) {
    if (minutes < rule.below) {
      score += rule.penalty;
      reasons.push(`${minutes} minutes in last 4`);
      break;
    }
  }

  const starts = form?.startsLast4 ?? 0;
  for (const rule of cfg.startsPenalty) {
    if (starts <= rule.atMost) {
      score += rule.penalty;
      reasons.push(`${starts} start${starts === 1 ? "" : "s"} in last 4`);
      break;
    }
  }

  if (congestion?.isAfterCl) {
    score += cfg.congestionPenalty.afterCl;
    reasons.push("plays soon after a Champions League match");
  }
  if (congestion?.isBeforeCl) {
    score += cfg.congestionPenalty.beforeCl;
    reasons.push("plays shortly before a Champions League match");
  }

  score = Math.min(100, score);
  const band: MinutesRiskBand =
    score < cfg.bands.lowBelow ? "Low" : score < cfg.bands.mediumBelow ? "Medium" : "High";

  return { band, score, reasons };
}
