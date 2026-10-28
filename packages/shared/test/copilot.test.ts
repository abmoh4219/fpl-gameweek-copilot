import { describe, expect, it } from "vitest";
import {
  buildSquad,
  checkTransfer,
  findPlayers,
  kitFor,
  KEEPER_KIT,
  pitchRows,
  playerFacts,
  searchPlayers,
  squadFacts,
  type CardRow,
  type Entry,
  type EntryPicks,
  type SiteCard,
} from "../src/index.ts";

const run = {
  horizon: 5, gameweeks: [9, 10, 11, 12, 13], averageDifficulty: 3, adjustedDifficulty: 3, blanks: 0, doubles: 0, band: "Medium",
  fixtures: [{ gameweek: 9, opponent: "AVL", isHome: false, difficulty: 3, isBlank: false, isDouble: false }],
} as const;

let nextId = 1;
function card(o: Partial<SiteCard> & { webName: string; team: string; position: string }): SiteCard {
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
const squadCards: SiteCard[] = [
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
const market: SiteCard[] = [
  card({ fplId: 100, webName: "Mbeumo", team: "MUN", position: "MID", priceM: 7.9, form: { gameweeks: 4, points: 30, minutes: 360, starts: 4, xgiPer90: 0.7, score: 90 } }),
  card({ fplId: 101, webName: "Foden", team: "MCI", position: "MID", priceM: 8 }),
  card({ fplId: 102, webName: "Ødegaard", team: "ARS", position: "MID", priceM: 8.4, ownership: 12 }),
  card({ fplId: 103, webName: "Salah", team: "LIV", position: "MID", priceM: 13 }),
  card({ fplId: 104, webName: "Bench Warmer", team: "LIV", position: "MID", priceM: 4.5, form: { gameweeks: 4, points: 9, minutes: 20, starts: 0, xgiPer90: 3, score: 5 } }),
  card({ fplId: 105, webName: "Doubtful Dan", team: "FUL", position: "MID", priceM: 6, status: "d" }),
];
const all = [...squadCards, ...market];
const byId = new Map(all.map((c) => [c.fplId, c]));

const entry = {
  id: 7653564, name: "abmoh4219", player_first_name: "Abdelah", player_last_name: "Aliy", started_event: 1, current_event: 8,
  summary_overall_points: 548, summary_overall_rank: 399407, summary_event_points: 48, summary_event_rank: null,
  last_deadline_value: 1016, last_deadline_bank: 7, last_deadline_total_transfers: 3,
} as unknown as Entry;
const picks: EntryPicks = {
  active_chip: null,
  entry_history: { event: 8, points: 48, total_points: 548, overall_rank: 399408, bank: 7, value: 1016, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 19 },
  picks: squadCards.map((c, i) => ({
    element: c.fplId, position: i + 1, multiplier: i >= 11 ? 0 : c.fplId === 11 ? 2 : 1,
    is_captain: c.fplId === 11, is_vice_captain: c.fplId === 14,
    element_type: { GKP: 1, DEF: 2, MID: 3, FWD: 4 }[c.position]!,
  })),
};
const cardRows = new Map<number, CardRow>(all.map((c) => [c.fplId, { card: c, teamCode: c.team === "MCI" ? 43 : 3 }]));
const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map([[11, 8], [1, 7]]) });

describe("squad", () => {
  it("splits starters and bench in FPL's slot order, with the bank in millions", () => {
    expect(squad.starters).toHaveLength(11);
    expect(squad.bench.map((p) => p.webName)).toEqual(["Kinsky", "O'Reilly", "João Pedro", "Truffert"]);
    expect(squad.bankM).toBe(0.7);
    expect(squad.valueM).toBe(101.6);
  });

  it("applies the captain's multiplier to his points", () => {
    const haaland = squad.starters.find((p) => p.webName === "Haaland")!;
    expect(haaland.isCaptain).toBe(true);
    expect(haaland.pickPoints).toBe(16);
  });

  it("groups starters into pitch rows, keeper first", () => {
    expect(pitchRows(squad).map((r) => r.length)).toEqual([1, 3, 5, 2]);
  });

  it("gives every keeper the generic keeper shirt, never a club's", () => {
    expect(squad.starters[0]!.kit).toEqual(KEEPER_KIT);
    expect(kitFor(43, "FWD").primary).toBe("#6CABDD");
    expect(kitFor(9999, "MID").primary).toBe("#3A3A3A");
  });

  it("reports picks it has no card for instead of dropping them silently", () => {
    const partial = buildSquad({ entry, picks, cards: new Map([...cardRows].slice(1)), eventPoints: new Map() });
    expect(partial.missing).toEqual([1]);
  });

  it("gives the agent a compact squad with roles and the bank", () => {
    const facts = squadFacts(squad);
    expect(facts.bankM).toBe(0.7);
    expect(facts.starters.find((p) => p.name === "Haaland")?.role).toBe("captain");
    expect(facts.bench).toHaveLength(4);
  });
});

describe("findPlayers", () => {
  it("is accent- and case-insensitive", () => {
    expect(findPlayers(all, "odegaard")[0]?.webName).toBe("Ødegaard");
    expect(findPlayers(all, "joao pedro")[0]?.webName).toBe("João Pedro");
  });

  it("prefers an exact name, then a prefix", () => {
    expect(findPlayers(all, "Haaland").map((c) => c.webName)).toEqual(["Haaland"]);
    expect(findPlayers(all, "Sal")[0]?.webName).toBe("Salah");
  });

  it("returns nothing for nothing", () => {
    expect(findPlayers(all, "   ")).toEqual([]);
    expect(findPlayers(all, "zzzz")).toEqual([]);
  });
});

describe("searchPlayers", () => {
  it("filters by position and budget, and sorts by form", () => {
    const hits = searchPlayers(market, { position: "MID", maxPriceM: 8, sortBy: "form", limit: 5 });
    expect(hits[0]?.name).toBe("Mbeumo");
    expect(hits.every((h) => h.priceM <= 8)).toBe(true);
  });

  it("never suggests a player without minutes behind his numbers", () => {
    const hits = searchPlayers(market, { sortBy: "xgi90", limit: 10 });
    expect(hits.map((h) => h.name)).not.toContain("Bench Warmer");
  });

  it("skips doubtful players unless asked", () => {
    expect(searchPlayers(market, { sortBy: "form", limit: 10 }).map((h) => h.name)).not.toContain("Doubtful Dan");
    expect(searchPlayers(market, { sortBy: "form", limit: 10, availableOnly: false }).map((h) => h.name)).toContain("Doubtful Dan");
  });

  it("caps the list at 10", () => {
    expect(searchPlayers(all, { sortBy: "price", limit: 50, availableOnly: false }).length).toBeLessThanOrEqual(10);
  });
});

describe("checkTransfer", () => {
  it("accepts a legal swap and computes the bank after", () => {
    const result = checkTransfer(squad, byId, [8], [100]); // Cherki 8.0 out, Mbeumo 7.9 in
    expect(result.valid).toBe(true);
    expect(result.bankAfterM).toBe(0.8);
    expect(result.note).toMatch(/Estimate/);
  });

  it("rejects a position mismatch", () => {
    const result = checkTransfer(squad, byId, [2], [100]); // DEF out, MID in
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/Positions must match/);
  });

  it("rejects a fourth player from one club", () => {
    const result = checkTransfer(squad, byId, [6], [101]); // Foden would be the 4th MCI
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/4 players from MCI/);
  });

  it("rejects a transfer the bank cannot afford", () => {
    const result = checkTransfer(squad, byId, [6], [103]); // 5.0 out, 13.0 in with 0.7 in the bank
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/Short by £7\.3m/);
  });

  it("rejects selling someone the manager does not own, or buying someone twice", () => {
    expect(checkTransfer(squad, byId, [100], [101]).problems.join(" ")).toMatch(/not in this squad/);
    expect(checkTransfer(squad, byId, [6], [7]).problems.join(" ")).toMatch(/already in the squad/);
  });

  it("does price arithmetic in tenths, so 0.1 + 0.2 never drifts", () => {
    const result = checkTransfer(squad, byId, [2, 4], [13, 15]);
    expect(Number.isInteger(result.bankAfterM * 10)).toBe(true);
  });
});

describe("playerFacts", () => {
  it("is compact and readable, with the next fixtures as one line", () => {
    const facts = playerFacts(squadCards[7]!);
    expect(facts.status).toBe("injured");
    expect(facts.next5).toBe("AVL(A) 3");
    expect(JSON.stringify(facts)).not.toMatch(/momentum|hourly/i);
  });
});
