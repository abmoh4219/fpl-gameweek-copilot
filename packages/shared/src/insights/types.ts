/**
 * Plain shapes mirroring the database views, so every insight is a pure
 * function over data with no driver, no client and no clock.
 */

export type MinutesRiskBand = "Low" | "Medium" | "High";
export type FixtureRunBand = "Easy" | "Medium" | "Hard";
export type GoalThreatBand = "High" | "Medium" | "Low";

/** A row of core.player_current. */
export interface PlayerCurrentRow {
  playerId: number;
  fplId: number;
  webName: string;
  elementType: number;
  teamFplId: number;
  teamShortName: string;
  nowCost: number;
  priceM: number;
  costChangeEvent: number;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  selectedByPercent: number;
  netTransfersEvent: number;
  totalPoints: number;
  form: number;
  epNext: number;
  minutes: number;
  starts: number;
  expectedGoalInvolvements: number;
  expectedGoalInvolvementsPer90: number;
  penaltiesOrder: number | null;
  cornersOrder: number | null;
  freekicksOrder: number | null;
}

/** A row of core.player_form. */
export interface PlayerFormRow {
  playerId: number;
  gameweeksLast4: number;
  pointsLast4: number;
  minutesLast4: number;
  startsLast4: number;
  xgiLast4: number;
  xgiPer90Last4: number;
  pointsLast6: number;
  minutesLast6: number;
  xgiPer90Last6: number;
}

/** A row of core.fixture_ticker. */
export interface FixtureTickerRow {
  teamFplId: number;
  gameweek: number;
  gwOffset: number;
  isHome: boolean | null;
  opponentShortName: string | null;
  opponentTeamFplId: number | null;
  difficulty: number | null;
  isBlank: boolean;
  isDouble: boolean;
}

/** Team strength, from core.teams. */
export interface TeamStrength {
  teamFplId: number;
  shortName: string;
  strengthOverallHome: number;
  strengthOverallAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

/** A row of core.cl_congestion, reduced to the flags an insight needs. */
export interface CongestionFlags {
  teamFplId: number;
  gameweek: number;
  isAfterCl: boolean;
  isBeforeCl: boolean;
  daysSinceCl: number | null;
  daysUntilCl: number | null;
}

/** A row of core.price_watch. Deliberately WITHOUT momentum or hourly rate. */
export interface PriceWatchRow {
  playerId: number;
  fplId: number;
  webName: string;
  teamShortName: string;
  priceM: number;
  priceChangePercent: number | null;
  direction: string;
  isLocked: boolean;
}

/** A row of core.price_changes_daily. */
export interface PriceChangeRow {
  playerId: number;
  fplId: number;
  webName: string;
  elementType: number;
  teamShortName: string;
  changeTenths: number;
  changeM: number;
  priceM: number;
  direction: string;
}
