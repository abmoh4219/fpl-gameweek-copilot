import { INSIGHT_CONFIG } from "./config.ts";
import { round } from "./form.ts";
import type { PlayerCard } from "./player-card.ts";
import type { PriceWatchRow } from "./types.ts";

/**
 * Ranked selections built from already-computed player cards. These are the
 * "who should I pick" answers, and every one is an ESTIMATE.
 */

export interface RankedPick {
  fplId: number;
  webName: string;
  team: string;
  position: string;
  priceM: number;
  ownership: number;
  score: number;
  reason: string;
  card: PlayerCard;
}

/**
 * Captain candidates: FPL's own expected points, plus our goal-threat
 * estimate, fixture ease and home advantage. Anyone with a real minutes risk
 * is excluded — a captain who might be rested is not a captain.
 */
export function captainPicks(cards: readonly PlayerCard[]): RankedPick[] {
  const cfg = INSIGHT_CONFIG.captain;

  return cards
    .filter((c) => c.minutesRisk.score <= cfg.maxMinutesRisk)
    .filter((c) => c.form.minutes >= cfg.minMinutesLast4)
    .filter((c) => c.fixtures.fixtures.some((f) => !f.isBlank))
    .map((card) => toPick(card, captainScore(card), captainReason(card)))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.topN);
}

/** The captain score for one card: shared by the ranked picks and the lineup picker. */
export function captainScore(card: PlayerCard): number {
  const cfg = INSIGHT_CONFIG.captain;
  const ease = 5 - card.fixtures.adjustedDifficulty;
  const home = card.goalThreat.isHome ? 1 : 0;
  return (
    card.epNext * cfg.weights.epNext +
    card.goalThreat.score * cfg.weights.goalThreat +
    ease * cfg.weights.fixtureEase +
    home * cfg.weights.home
  );
}

/** Whether a card is eligible to captain at all: likely to play, and actually playing. */
export function canCaptain(card: PlayerCard): boolean {
  const cfg = INSIGHT_CONFIG.captain;
  return card.minutesRisk.score <= cfg.maxMinutesRisk && card.form.minutes >= cfg.minMinutesLast4;
}

function captainReason(card: PlayerCard): string {
  const parts = [`ep ${card.epNext.toFixed(1)}`, `${card.goalThreat.band.toLowerCase()} threat`];
  if (card.goalThreat.opponent) {
    parts.push(`${card.goalThreat.isHome ? "vs" : "at"} ${card.goalThreat.opponent}`);
  }
  if (card.goalThreat.onPenalties) parts.push("on penalties");
  return parts.join(", ");
}

/**
 * Differentials: genuinely low owned, playing regularly, and backed by form
 * and fixtures. Scarcity is part of the score — at equal quality, the rarer
 * pick is the better differential.
 */
export function differentialPicks(cards: readonly PlayerCard[]): RankedPick[] {
  const cfg = INSIGHT_CONFIG.differentials;

  return cards
    .filter((c) => c.ownership < cfg.maxOwnership)
    .filter((c) => c.form.minutes >= cfg.minMinutesLast4)
    .filter((c) => c.minutesRisk.band !== "High")
    .filter((c) => c.fixtures.band !== "Hard")
    .map((card) => {
      const ease = 5 - card.fixtures.adjustedDifficulty;
      const scarcity = (cfg.maxOwnership - card.ownership) / cfg.maxOwnership;
      const score =
        (card.form.score / 100) * cfg.weights.form +
        card.goalThreat.score * cfg.weights.goalThreat +
        ease * cfg.weights.fixtureEase +
        scarcity * cfg.weights.scarcity;

      return toPick(
        card,
        score,
        `${card.ownership.toFixed(1)}% owned, ${card.form.points} pts in last 4, ${card.fixtures.band.toLowerCase()} run`,
      );
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.topN);
}

function toPick(card: PlayerCard, score: number, reason: string): RankedPick {
  return {
    fplId: card.fplId,
    webName: card.webName,
    team: card.team,
    position: card.position,
    priceM: card.priceM,
    ownership: card.ownership,
    score: round(score, 3),
    reason,
    card,
  };
}

export interface PriceWatchPick {
  fplId: number;
  webName: string;
  team: string;
  priceM: number;
  percent: number;
  direction: "rising" | "falling";
  isLocked: boolean;
}

/**
 * Likely risers and fallers.
 *
 * DIRECTION COMES ONLY FROM price_change_percent. The hourly rate and the
 * experimental `momentum` column are deliberately not read here and never
 * reach a report — the hypothesis behind them is unvalidated
 * (docs/data-dictionary.md, open question 2).
 */
export function priceWatchPicks(rows: readonly PriceWatchRow[]): {
  risers: PriceWatchPick[];
  fallers: PriceWatchPick[];
} {
  const cfg = INSIGHT_CONFIG.priceWatch;

  const eligible = rows.filter(
    (r) => r.priceChangePercent !== null && Math.abs(r.priceChangePercent) >= cfg.minAbsPercent,
  );

  const toPickRow = (r: PriceWatchRow): PriceWatchPick => ({
    fplId: r.fplId,
    webName: r.webName,
    team: r.teamShortName,
    priceM: r.priceM,
    percent: round(r.priceChangePercent ?? 0, 1),
    direction: (r.priceChangePercent ?? 0) > 0 ? "rising" : "falling",
    isLocked: r.isLocked,
  });

  return {
    risers: eligible
      .filter((r) => (r.priceChangePercent ?? 0) > 0)
      .sort((a, b) => (b.priceChangePercent ?? 0) - (a.priceChangePercent ?? 0))
      .slice(0, cfg.topN)
      .map(toPickRow),
    fallers: eligible
      .filter((r) => (r.priceChangePercent ?? 0) < 0)
      .sort((a, b) => (a.priceChangePercent ?? 0) - (b.priceChangePercent ?? 0))
      .slice(0, cfg.topN)
      .map(toPickRow),
  };
}
