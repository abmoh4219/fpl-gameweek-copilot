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
} from "../src/index.ts";
import { all, byId, cardRows, entry, market, picks, squadCards } from "./fixtures.ts";

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
