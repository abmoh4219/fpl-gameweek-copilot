import { INSIGHT_CONFIG } from "./config.ts";
import { round } from "./form.ts";
import type {
  FixtureTickerRow,
  GoalThreatBand,
  PlayerCurrentRow,
  PlayerFormRow,
  TeamStrength,
} from "./types.ts";

export interface GoalThreatInsight {
  band: GoalThreatBand;
  /** Expected goal involvements per 90, adjusted for opponent and venue. */
  score: number;
  baseXgiPer90: number;
  opponent: string | null;
  isHome: boolean | null;
  onPenalties: boolean;
  /** Always true. Forward-looking numbers are estimates, never predictions. */
  isEstimate: true;
}

/**
 * Goal threat for the NEXT gameweek.
 *
 * Blends season and recent xGI/90 (recent weighted higher, season anchoring
 * it against a small sample), scales by how leaky the opponent is, and adds a
 * bonus for penalty duty. It is an ESTIMATE and is labelled as one everywhere
 * it is rendered.
 */
export function goalThreatInsight(
  player: PlayerCurrentRow,
  form: PlayerFormRow | undefined,
  ticker: readonly FixtureTickerRow[],
  strengths: ReadonlyMap<number, TeamStrength>,
): GoalThreatInsight {
  const cfg = INSIGHT_CONFIG.goalThreat;

  const seasonXgi = player.expectedGoalInvolvementsPer90;
  const recentXgi = form?.xgiPer90Last4 ?? seasonXgi;

  // Trust a per-90 rate in proportion to the minutes behind it. With no
  // recent minutes this collapses to the season figure rather than treating
  // a single cameo as a reliable rate.
  const reliability = Math.max(
    0,
    Math.min(1, (form?.minutesLast4 ?? 0) / cfg.minMinutesForRecent),
  );
  const recentWeight = cfg.recentWeight * reliability;
  const totalWeight = cfg.seasonWeight + recentWeight;
  const base = (seasonXgi * cfg.seasonWeight + recentXgi * recentWeight) / totalWeight;

  const next = ticker
    .filter((r) => r.teamFplId === player.teamFplId && !r.isBlank)
    .sort((a, b) => a.gameweek - b.gameweek)[0];

  let multiplier = 1;
  let opponent: string | null = null;
  let isHome: boolean | null = null;

  if (next) {
    opponent = next.opponentShortName;
    isHome = next.isHome;

    const opponentTeam =
      next.opponentTeamFplId === null ? undefined : strengths.get(next.opponentTeamFplId);
    if (opponentTeam) {
      // A WEAKER defence means a higher multiplier.
      const defence = defensiveRating(opponentTeam, next.isHome === true);
      const weakness = (cfg.defenceBaseline - defence) / cfg.defenceScale;
      multiplier *= 1 + weakness * cfg.defenceWeight;
    }
    if (next.isHome) multiplier *= cfg.homeBonus;
  } else {
    // No fixture: no threat.
    multiplier = 0;
  }

  const onPenalties = player.penaltiesOrder === 1 || player.penaltiesOrder === 2;
  if (player.penaltiesOrder === 1) multiplier *= cfg.penaltyBonus.first;
  else if (player.penaltiesOrder === 2) multiplier *= cfg.penaltyBonus.second;

  // Scale by how much evidence there is for the rate at all. Without this a
  // 3-minute cameo reads as elite (season xGI/90 of 12.9 was observed).
  const sampleConfidence = Math.max(
    0,
    Math.min(1, player.minutes / cfg.minSeasonMinutesForRate),
  );

  const score = Math.max(0, base * multiplier * sampleConfidence);
  const band: GoalThreatBand =
    score >= cfg.bands.highAtLeast ? "High" : score >= cfg.bands.mediumAtLeast ? "Medium" : "Low";

  return {
    band,
    score: round(score, 3),
    baseXgiPer90: round(base, 3),
    opponent,
    isHome,
    onPenalties,
    isEstimate: true,
  };
}

/**
 * The opponent's defensive rating for this fixture.
 *
 * `strength_defence_home` / `_away` are ZERO for every team in the current
 * API, which would otherwise read as "no defence at all" and inflate every
 * threat score. When they are unusable we fall back to overall strength,
 * which is on the same 1-5 scale (docs/data-dictionary.md).
 */
export function defensiveRating(team: TeamStrength, playerIsHome: boolean): number {
  const defence = playerIsHome ? team.strengthDefenceAway : team.strengthDefenceHome;
  if (defence > 0) return defence;
  return playerIsHome ? team.strengthOverallAway : team.strengthOverallHome;
}
