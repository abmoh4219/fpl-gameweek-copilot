import { INSIGHT_CONFIG } from "./config.ts";
import { round } from "./form.ts";
import type { FixtureRunBand, FixtureTickerRow, TeamStrength } from "./types.ts";

export interface FixtureRunInsight {
  horizon: number;
  gameweeks: number[];
  /** Raw FPL difficulty, 1-5. */
  averageDifficulty: number;
  /** Difficulty adjusted for opponent strength, home advantage and blanks. */
  adjustedDifficulty: number;
  blanks: number;
  doubles: number;
  band: FixtureRunBand;
  fixtures: FixtureSummary[];
}

export interface FixtureSummary {
  gameweek: number;
  opponent: string | null;
  isHome: boolean | null;
  difficulty: number | null;
  isBlank: boolean;
  isDouble: boolean;
}

/**
 * How kind are the next N gameweeks?
 *
 * FPL's own difficulty is the base, then nudged by the opponent's overall
 * strength (FPL difficulty is coarse — every "4" is not equal), by home
 * advantage, and by blanks and doubles, which matter more than any single
 * fixture's rating.
 */
export function fixtureRunInsight(
  teamFplId: number,
  ticker: readonly FixtureTickerRow[],
  strengths: ReadonlyMap<number, TeamStrength>,
  horizon: number = INSIGHT_CONFIG.fixtureRun.shortHorizon,
): FixtureRunInsight {
  const cfg = INSIGHT_CONFIG.fixtureRun;

  const rows = ticker
    .filter((r) => r.teamFplId === teamFplId && r.gwOffset <= horizon)
    .sort((a, b) => a.gameweek - b.gameweek || (a.difficulty ?? 0) - (b.difficulty ?? 0));

  const gameweeks = [...new Set(rows.map((r) => r.gameweek))];
  const played = rows.filter((r) => !r.isBlank);
  const blanks = new Set(rows.filter((r) => r.isBlank).map((r) => r.gameweek)).size;
  const doubles = new Set(rows.filter((r) => r.isDouble).map((r) => r.gameweek)).size;

  const difficulties = played.map((r) => r.difficulty ?? 3);
  const averageDifficulty = difficulties.length
    ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
    : 5;

  let adjusted = averageDifficulty;

  if (played.length > 0) {
    const nudges = played.map((row) => {
      const opponent = row.opponentTeamFplId === null
        ? undefined
        : strengths.get(row.opponentTeamFplId);
      if (!opponent) return 0;
      const strength = row.isHome ? opponent.strengthOverallAway : opponent.strengthOverallHome;
      const normalised = (strength - cfg.strengthBaseline) / cfg.strengthScale;
      const home = row.isHome ? -cfg.homeAdvantage : 0;
      return normalised * cfg.strengthWeight + home;
    });
    adjusted += nudges.reduce((a, b) => a + b, 0) / nudges.length;
  }

  adjusted += blanks * cfg.blankPenalty;
  adjusted -= doubles * cfg.doubleBonus;
  adjusted = Math.max(1, Math.min(6, adjusted));

  const band: FixtureRunBand =
    adjusted <= cfg.bands.easyAtMost ? "Easy" : adjusted <= cfg.bands.mediumAtMost ? "Medium" : "Hard";

  return {
    horizon,
    gameweeks,
    averageDifficulty: round(averageDifficulty, 2),
    adjustedDifficulty: round(adjusted, 2),
    blanks,
    doubles,
    band,
    fixtures: rows.map((r) => ({
      gameweek: r.gameweek,
      opponent: r.opponentShortName,
      isHome: r.isHome,
      difficulty: r.difficulty,
      isBlank: r.isBlank,
      isDouble: r.isDouble,
    })),
  };
}
