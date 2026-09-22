import { formInsight, type FormInsight } from "./form.ts";
import { fixtureRunInsight, type FixtureRunInsight } from "./fixture-run.ts";
import { goalThreatInsight, type GoalThreatInsight } from "./goal-threat.ts";
import { minutesRiskInsight, type MinutesRiskInsight } from "./minutes-risk.ts";
import { INSIGHT_CONFIG } from "./config.ts";
import type {
  CongestionFlags,
  FixtureTickerRow,
  PlayerCurrentRow,
  PlayerFormRow,
  TeamStrength,
} from "./types.ts";

/**
 * Everything a report needs about one player, computed once.
 *
 * Every number here is calculated in code. Nothing downstream — renderer,
 * website, or a future AI step — may invent a statistic that is not on this
 * object.
 */
export interface PlayerCard {
  playerId: number;
  fplId: number;
  webName: string;
  team: string;
  position: string;
  priceM: number;
  priceChangeEventTenths: number;
  ownership: number;
  netTransfersEvent: number;
  totalPoints: number;
  epNext: number;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  minutes: number;
  starts: number;
  xgiPer90: number;
  form: FormInsight;
  minutesRisk: MinutesRiskInsight;
  fixtures: FixtureRunInsight;
  goalThreat: GoalThreatInsight;
  congestion: { isAfterCl: boolean; isBeforeCl: boolean } | null;
  setPieces: { penalties: number | null; corners: number | null; freekicks: number | null };
}

const POSITIONS: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

export interface CardInputs {
  forms: ReadonlyMap<number, PlayerFormRow>;
  ticker: readonly FixtureTickerRow[];
  strengths: ReadonlyMap<number, TeamStrength>;
  congestion: ReadonlyMap<number, CongestionFlags>;
}

export function buildPlayerCard(player: PlayerCurrentRow, inputs: CardInputs): PlayerCard {
  const form = inputs.forms.get(player.playerId);
  const congestion = inputs.congestion.get(player.teamFplId);

  return {
    playerId: player.playerId,
    fplId: player.fplId,
    webName: player.webName,
    team: player.teamShortName,
    position: POSITIONS[player.elementType] ?? "UNK",
    priceM: player.priceM,
    priceChangeEventTenths: player.costChangeEvent,
    ownership: player.selectedByPercent,
    netTransfersEvent: player.netTransfersEvent,
    totalPoints: player.totalPoints,
    epNext: player.epNext,
    status: player.status,
    news: player.news,
    chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,
    minutes: player.minutes,
    starts: player.starts,
    xgiPer90: player.expectedGoalInvolvementsPer90,
    form: formInsight(form),
    minutesRisk: minutesRiskInsight(player, form, congestion),
    fixtures: fixtureRunInsight(
      player.teamFplId,
      inputs.ticker,
      inputs.strengths,
      INSIGHT_CONFIG.fixtureRun.shortHorizon,
    ),
    goalThreat: goalThreatInsight(player, form, inputs.ticker, inputs.strengths),
    congestion: congestion
      ? { isAfterCl: congestion.isAfterCl, isBeforeCl: congestion.isBeforeCl }
      : null,
    setPieces: {
      penalties: player.penaltiesOrder,
      corners: player.cornersOrder,
      freekicks: player.freekicksOrder,
    },
  };
}
