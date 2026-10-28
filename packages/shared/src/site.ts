import { INSIGHT_CONFIG } from "./insights/config.ts";
import { fixtureRunInsight, type FixtureRunInsight } from "./insights/fixture-run.ts";
import type { PlayerCard } from "./insights/player-card.ts";
import type { FixtureTickerRow, TeamStrength } from "./insights/types.ts";

/**
 * What the website renders (ADR-0008). jobs/ builds these with the insight
 * engine and publishes them to core.player_cards and core.team_runs; the site
 * reads them through api views and never computes a number itself.
 *
 * `version` lets the site refuse a shape it does not know, the same rule as
 * report payloads.
 */
export const SITE_DATA_VERSION = 1;

export interface SiteCard extends PlayerCard {
  version: number;
  /** The 5-gameweek run, for the player page. `fixtures` stays the 3-gameweek one. */
  fixturesLong: FixtureRunInsight;
}

export interface TeamRun {
  version: number;
  teamFplId: number;
  team: string;
  short: FixtureRunInsight;
  long: FixtureRunInsight;
}

export function siteCards(
  cards: readonly PlayerCard[],
  ticker: readonly FixtureTickerRow[],
  strengths: ReadonlyMap<number, TeamStrength>,
): SiteCard[] {
  const { longHorizon } = INSIGHT_CONFIG.fixtureRun;
  // One long run per TEAM, shared by its ~30 players. Cards carry the team's
  // short name, which is unique within a season.
  const longRuns = new Map<string, FixtureRunInsight>();
  for (const s of strengths.values()) {
    longRuns.set(s.shortName, fixtureRunInsight(s.teamFplId, ticker, strengths, longHorizon));
  }

  return cards.flatMap((card) => {
    const fixturesLong = longRuns.get(card.team);
    return fixturesLong ? [{ ...card, version: SITE_DATA_VERSION, fixturesLong }] : [];
  });
}

export function teamRuns(
  ticker: readonly FixtureTickerRow[],
  strengths: ReadonlyMap<number, TeamStrength>,
): TeamRun[] {
  const { shortHorizon, longHorizon } = INSIGHT_CONFIG.fixtureRun;
  return [...strengths.values()].map((s) => ({
    version: SITE_DATA_VERSION,
    teamFplId: s.teamFplId,
    team: s.shortName,
    short: fixtureRunInsight(s.teamFplId, ticker, strengths, shortHorizon),
    long: fixtureRunInsight(s.teamFplId, ticker, strengths, longHorizon),
  }));
}
