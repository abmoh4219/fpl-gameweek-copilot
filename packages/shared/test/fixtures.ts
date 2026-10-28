import type { CardRow, Entry, EntryPicks, SiteCard } from "../src/index.ts";

/**
 * A synthetic squad shared by the co-pilot and lineup tests: a legal 15
 * (2 GKP, 5 DEF, 5 MID, 3 FWD, at most 3 per club) plus a small market.
 */
const run = {
  horizon: 5, gameweeks: [9, 10, 11, 12, 13], averageDifficulty: 3, adjustedDifficulty: 3, blanks: 0, doubles: 0, band: "Medium",
  fixtures: [{ gameweek: 9, opponent: "AVL", isHome: false, difficulty: 3, isBlank: false, isDouble: false }],
} as const;

let nextId = 1;
export function card(o: Partial<SiteCard> & { webName: string; team: string; position: string }): SiteCard {
  const id = o.fplId ?? nextId++;
  return {
    version: 1, playerId: id, fplId: id, priceM: 5, priceChangeEventTenths: 0, ownership: 5, netTransfersEvent: 0,
    totalPoints: 30, epNext: 4, status: "a", news: "", chanceOfPlayingNextRound: null, minutes: 600, starts: 7, xgiPer90: 0.3,
    form: { gameweeks: 4, points: 16, minutes: 360, starts: 4, xgiPer90: 0.3, score: 50 },
    minutesRisk: { band: "Low", score: 5, reasons: [] },
    fixtures: { ...run, horizon: 3, fixtures: [...run.fixtures] },
    goalThreat: { band: "Medium", score: 0.3, baseXgiPer90: 0.3, opponent: "AVL", isHome: false, onPenalties: false, isEstimate: true },
    congestion: null, setPieces: { penalties: null, corners: null, freekicks: null },
    fixturesLong: { ...run, fixtures: [...run.fixtures] },
    ...o,
  } as SiteCard;
}

// A legal 15: 2 GKP, 5 DEF, 5 MID, 3 FWD, never more than 3 per club.
export const squadCards: SiteCard[] = [
  card({ fplId: 1, webName: "Raya", team: "ARS", position: "GKP", priceM: 6 }),
  card({ fplId: 2, webName: "Kayode", team: "BRE", position: "DEF", priceM: 4.5 }),
  card({ fplId: 3, webName: "Calafiori", team: "ARS", position: "DEF", priceM: 6 }),
  card({ fplId: 4, webName: "Vuskovic", team: "BHA", position: "DEF", priceM: 4.5 }),
  card({ fplId: 5, webName: "Tavernier", team: "BOU", position: "MID", priceM: 5.5 }),
  card({ fplId: 6, webName: "Belloumi", team: "HUL", position: "MID", priceM: 5 }),
  card({ fplId: 7, webName: "Rogers", team: "CHE", position: "MID", priceM: 8 }),
  card({ fplId: 8, webName: "Cherki", team: "MCI", position: "MID", priceM: 8, status: "i", chanceOfPlayingNextRound: 0 }),
  card({ fplId: 9, webName: "Schade", team: "BRE", position: "MID", priceM: 7 }),
  card({ fplId: 10, webName: "Kostoulas", team: "BHA", position: "FWD", priceM: 6 }),
  card({ fplId: 11, webName: "Haaland", team: "MCI", position: "FWD", priceM: 15.7, ownership: 77.4 }),
  card({ fplId: 12, webName: "Kinsky", team: "TOT", position: "GKP", priceM: 4 }),
  card({ fplId: 13, webName: "O'Reilly", team: "MCI", position: "DEF", priceM: 5 }),
  card({ fplId: 14, webName: "João Pedro", team: "CHE", position: "FWD", priceM: 7.9 }),
  card({ fplId: 15, webName: "Truffert", team: "BOU", position: "DEF", priceM: 4.5 }),
];
export const market: SiteCard[] = [
  card({ fplId: 100, webName: "Mbeumo", team: "MUN", position: "MID", priceM: 7.9, form: { gameweeks: 4, points: 30, minutes: 360, starts: 4, xgiPer90: 0.7, score: 90 } }),
  card({ fplId: 101, webName: "Foden", team: "MCI", position: "MID", priceM: 8 }),
  card({ fplId: 102, webName: "Ødegaard", team: "ARS", position: "MID", priceM: 8.4, ownership: 12 }),
  card({ fplId: 103, webName: "Salah", team: "LIV", position: "MID", priceM: 13 }),
  card({ fplId: 104, webName: "Bench Warmer", team: "LIV", position: "MID", priceM: 4.5, form: { gameweeks: 4, points: 9, minutes: 20, starts: 0, xgiPer90: 3, score: 5 } }),
  card({ fplId: 105, webName: "Doubtful Dan", team: "FUL", position: "MID", priceM: 6, status: "d" }),
];
export const all = [...squadCards, ...market];
export const byId = new Map(all.map((c) => [c.fplId, c]));

export const entry = {
  id: 7653564, name: "abmoh4219", player_first_name: "Abdelah", player_last_name: "Aliy", started_event: 1, current_event: 8,
  summary_overall_points: 548, summary_overall_rank: 399407, summary_event_points: 48, summary_event_rank: null,
  last_deadline_value: 1016, last_deadline_bank: 7, last_deadline_total_transfers: 3,
} as unknown as Entry;
export const picks: EntryPicks = {
  active_chip: null,
  entry_history: { event: 8, points: 48, total_points: 548, overall_rank: 399408, bank: 7, value: 1016, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 19 },
  picks: squadCards.map((c, i) => ({
    element: c.fplId, position: i + 1, multiplier: i >= 11 ? 0 : c.fplId === 11 ? 2 : 1,
    is_captain: c.fplId === 11, is_vice_captain: c.fplId === 14,
    element_type: { GKP: 1, DEF: 2, MID: 3, FWD: 4 }[c.position]!,
  })),
};
export const cardRows = new Map<number, CardRow>(all.map((c) => [c.fplId, { card: c, teamCode: c.team === "MCI" ? 43 : 3 }]));
