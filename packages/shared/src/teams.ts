import type { FootballDataMatch } from "./schemas/football-data.ts";

/**
 * FPL team id <-> football-data.org team id, for the CURRENT SEASON ONLY.
 *
 * Both sets of IDs are season-scoped and the Premier League changes every
 * year, so this table is regenerated from samples/ each season and a test
 * fails the moment it drifts (CLAUDE.md §5).
 *
 * Matching is by name, reviewed by hand. NEVER match on TLA: TLAs are not
 * unique across football-data (FCB is both Barcelona and Bayern Munich).
 */
export interface TeamMapping {
  /** FPL team id (bootstrap-static.teams[].id) */
  fplId: number;
  /** FPL short name, e.g. "ARS" */
  fplShort: string;
  /** FPL display name, e.g. "Man City" */
  fplName: string;
  /** football-data.org numeric team id — the only safe join key */
  footballDataId: number;
  /** football-data.org display name, e.g. "Manchester City FC" */
  footballDataName: string;
}

export const SEASON = "2026/27";

export const TEAM_MAPPINGS: readonly TeamMapping[] = [
  { fplId: 1, fplShort: "ARS", fplName: "Arsenal", footballDataId: 57, footballDataName: "Arsenal FC" },
  { fplId: 2, fplShort: "AVL", fplName: "Aston Villa", footballDataId: 58, footballDataName: "Aston Villa FC" },
  { fplId: 3, fplShort: "BOU", fplName: "Bournemouth", footballDataId: 1044, footballDataName: "AFC Bournemouth" },
  { fplId: 4, fplShort: "BRE", fplName: "Brentford", footballDataId: 402, footballDataName: "Brentford FC" },
  { fplId: 5, fplShort: "BHA", fplName: "Brighton", footballDataId: 397, footballDataName: "Brighton & Hove Albion FC" },
  { fplId: 6, fplShort: "CHE", fplName: "Chelsea", footballDataId: 61, footballDataName: "Chelsea FC" },
  { fplId: 7, fplShort: "COV", fplName: "Coventry City", footballDataId: 1076, footballDataName: "Coventry City FC" },
  { fplId: 8, fplShort: "CRY", fplName: "Crystal Palace", footballDataId: 354, footballDataName: "Crystal Palace FC" },
  { fplId: 9, fplShort: "EVE", fplName: "Everton", footballDataId: 62, footballDataName: "Everton FC" },
  { fplId: 10, fplShort: "FUL", fplName: "Fulham", footballDataId: 63, footballDataName: "Fulham FC" },
  { fplId: 11, fplShort: "HUL", fplName: "Hull City", footballDataId: 322, footballDataName: "Hull City AFC" },
  { fplId: 12, fplShort: "IPS", fplName: "Ipswich Town", footballDataId: 349, footballDataName: "Ipswich Town FC" },
  { fplId: 13, fplShort: "LEE", fplName: "Leeds", footballDataId: 341, footballDataName: "Leeds United FC" },
  { fplId: 14, fplShort: "LIV", fplName: "Liverpool", footballDataId: 64, footballDataName: "Liverpool FC" },
  { fplId: 15, fplShort: "MCI", fplName: "Man City", footballDataId: 65, footballDataName: "Manchester City FC" },
  { fplId: 16, fplShort: "MUN", fplName: "Man Utd", footballDataId: 66, footballDataName: "Manchester United FC" },
  { fplId: 17, fplShort: "NEW", fplName: "Newcastle", footballDataId: 67, footballDataName: "Newcastle United FC" },
  { fplId: 18, fplShort: "NFO", fplName: "Nott'm Forest", footballDataId: 351, footballDataName: "Nottingham Forest FC" },
  { fplId: 19, fplShort: "TOT", fplName: "Spurs", footballDataId: 73, footballDataName: "Tottenham Hotspur FC" },
  { fplId: 20, fplShort: "SUN", fplName: "Sunderland", footballDataId: 71, footballDataName: "Sunderland AFC" },
];

const BY_FPL_ID = new Map(TEAM_MAPPINGS.map((m) => [m.fplId, m]));
const BY_FOOTBALL_DATA_ID = new Map(TEAM_MAPPINGS.map((m) => [m.footballDataId, m]));

export function byFplId(fplId: number): TeamMapping | undefined {
  return BY_FPL_ID.get(fplId);
}

export function byFootballDataId(footballDataId: number): TeamMapping | undefined {
  return BY_FOOTBALL_DATA_ID.get(footballDataId);
}

export function toFootballDataId(fplId: number): number | undefined {
  return BY_FPL_ID.get(fplId)?.footballDataId;
}

export function toFplId(footballDataId: number): number | undefined {
  return BY_FOOTBALL_DATA_ID.get(footballDataId)?.fplId;
}

/**
 * Which Premier League clubs appear in a set of Champions League matches.
 *
 * Derived from the matches every run, never hardcoded: knockout fixtures are
 * only added after the league stage, and the qualifying clubs change yearly
 * (CLAUDE.md §6).
 *
 * Returns FPL team ids.
 */
export function premierLeagueClubsInMatches(
  matches: readonly FootballDataMatch[],
): number[] {
  const fplIds = new Set<number>();
  for (const match of matches) {
    for (const side of [match.homeTeam, match.awayTeam]) {
      const fplId = toFplId(side.id);
      if (fplId !== undefined) fplIds.add(fplId);
    }
  }
  return [...fplIds].sort((a, b) => a - b);
}
