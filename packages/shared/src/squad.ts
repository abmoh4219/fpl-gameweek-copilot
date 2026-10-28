import type { FixtureSummary } from "./insights/fixture-run.ts";
import { kitFor, type Kit } from "./kits.ts";
import type { Entry, EntryPicks } from "./schemas/index.ts";
import type { SiteCard } from "./site.ts";

/**
 * One manager's squad, as the site and the agent both see it
 * (docs/agent-plan.md §4).
 *
 * Pure: the FPL responses and our published cards go in, a render-ready
 * squad comes out. Every number on it was computed by the pipeline or comes
 * straight from FPL; nothing here estimates anything.
 */
export interface SquadPlayer {
  fplId: number;
  webName: string;
  team: string;
  teamCode: number;
  position: "GKP" | "DEF" | "MID" | "FWD";
  /** FPL squad slot, 1-11 starting, 12-15 bench in order. */
  slot: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** 0 benched, 1 playing, 2 captain, 3 triple captain. */
  multiplier: number;
  priceM: number;
  ownership: number;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  /** This gameweek's points before the multiplier. */
  eventPoints: number;
  /** What the player contributes to the manager's total: points x multiplier. */
  pickPoints: number;
  formPoints: number;
  xgiPer90: number;
  minutesRisk: string;
  goalThreat: string;
  fixtureBand: string;
  /** The next five gameweeks, from the 5-gameweek run. */
  fixtures: FixtureSummary[];
  kit: Kit;
}

export interface Squad {
  entryId: number;
  teamName: string;
  managerName: string;
  gameweek: number;
  gameweekPoints: number;
  totalPoints: number;
  overallRank: number | null;
  /** Tenths stay in the data layer; these are display millions. */
  bankM: number;
  valueM: number;
  activeChip: string | null;
  starters: SquadPlayer[];
  bench: SquadPlayer[];
  /** Picks whose player is not in our published cards (rare: a brand-new signing). */
  missing: number[];
}

export interface CardRow {
  card: SiteCard;
  teamCode: number;
}

export const POSITION_BY_TYPE = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;

export function buildSquad(input: {
  entry: Entry;
  picks: EntryPicks;
  cards: ReadonlyMap<number, CardRow>;
  eventPoints: ReadonlyMap<number, number>;
}): Squad {
  const { entry, picks } = input;
  const players: SquadPlayer[] = [];
  const missing: number[] = [];

  for (const pick of [...picks.picks].sort((a, b) => a.position - b.position)) {
    const row = input.cards.get(pick.element);
    if (!row) {
      missing.push(pick.element);
      continue;
    }
    const { card } = row;
    const position =
      POSITION_BY_TYPE[pick.element_type as keyof typeof POSITION_BY_TYPE] ?? "MID";
    const eventPoints = input.eventPoints.get(pick.element) ?? 0;

    players.push({
      fplId: card.fplId,
      webName: card.webName,
      team: card.team,
      teamCode: row.teamCode,
      position,
      slot: pick.position,
      isStarter: pick.position <= 11,
      isCaptain: pick.is_captain,
      isViceCaptain: pick.is_vice_captain,
      multiplier: pick.multiplier,
      priceM: card.priceM,
      ownership: card.ownership,
      status: card.status,
      news: card.news,
      chanceOfPlayingNextRound: card.chanceOfPlayingNextRound,
      eventPoints,
      pickPoints: eventPoints * pick.multiplier,
      formPoints: card.form.points,
      xgiPer90: card.xgiPer90,
      minutesRisk: card.minutesRisk.band,
      goalThreat: card.goalThreat.band,
      fixtureBand: card.fixturesLong.band,
      fixtures: card.fixturesLong.fixtures,
      kit: kitFor(row.teamCode, position),
    });
  }

  const history = picks.entry_history;
  return {
    entryId: entry.id,
    teamName: entry.name,
    managerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
    gameweek: history.event,
    gameweekPoints: history.points,
    totalPoints: history.total_points,
    overallRank: history.overall_rank,
    bankM: history.bank / 10,
    valueM: history.value / 10,
    activeChip: picks.active_chip,
    starters: players.filter((p) => p.isStarter),
    bench: players.filter((p) => !p.isStarter),
    missing,
  };
}

/** Starters grouped into pitch rows, keeper first. */
export function pitchRows(squad: Squad): SquadPlayer[][] {
  return (["GKP", "DEF", "MID", "FWD"] as const).map((pos) =>
    squad.starters.filter((p) => p.position === pos),
  );
}
