import { describe, expect, it } from "vitest";
import {
  applyPlan,
  bestLineup,
  buildSquad,
  describePlan,
  expectedPoints,
  isEmptyPlan,
  lineupPoints,
  lineupProblems,
  planOf,
  rateLineup,
  squadPlayerFromCard,
  type LineupPlayer,
  type LineupPosition,
  type TeamPlan,
} from "../src/index.ts";
import { card, cardRows, entry, picks, squadCards } from "./fixtures.ts";

const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });

/** The fixture squad with chosen expected points (Haaland highest, Kinsky lowest). */
function pool(ep: Record<number, number> = {}): LineupPlayer[] {
  return squadCards.map((c) => ({
    fplId: c.fplId,
    webName: c.webName,
    position: c.position as LineupPosition,
    card: { ...c, epNext: ep[c.fplId] ?? c.epNext },
  }));
}

describe("expectedPoints", () => {
  it("is FPL's ep_next, and zero for anyone ruled out", () => {
    expect(expectedPoints(card({ webName: "A", team: "ARS", position: "MID", epNext: 6.2 }))).toBe(6.2);
    expect(expectedPoints(card({ webName: "B", team: "ARS", position: "MID", epNext: 6.2, status: "i" }))).toBe(0);
    expect(expectedPoints(card({ webName: "C", team: "ARS", position: "MID", epNext: 6.2, chanceOfPlayingNextRound: 0 }))).toBe(0);
  });
});

describe("bestLineup", () => {
  it("fields a legal XI with the reserve keeper first on the bench", () => {
    const players = pool({ 11: 9, 14: 6, 10: 5 });
    const best = bestLineup(players);
    expect(lineupProblems(best, players)).toEqual([]);
    expect(best.starters).toHaveLength(11);
    const firstBench = players.find((p) => p.fplId === best.bench[0])!;
    expect(firstBench.position).toBe("GKP");
  });

  it("benches a player who is ruled out", () => {
    // Cherki (8) is injured in the fixture: expected points 0.
    const best = bestLineup(pool({ 8: 9 }));
    expect(best.starters).not.toContain(8);
  });

  it("picks the best formation, not a fixed one", () => {
    // Three strong forwards and weak midfielders: 3 forwards should start.
    const players = pool({ 10: 8, 11: 9, 14: 8, 5: 1, 6: 1, 7: 1, 9: 1 });
    const best = bestLineup(players);
    expect(best.starters).toEqual(expect.arrayContaining([10, 11, 14]));
  });

  it("captains the highest captain score and gives the vice to someone else", () => {
    const best = bestLineup(pool({ 11: 9 }));
    expect(best.captain).toBe(11);
    expect(best.vice).not.toBe(11);
    expect(best.starters).toContain(best.vice);
  });
});

describe("lineupProblems", () => {
  const players = pool();
  const legal = planOf(squad);

  it("accepts the real FPL lineup", () => {
    expect(lineupProblems(legal, players)).toEqual([]);
  });

  it("rejects two keepers starting", () => {
    const twoKeepers = { ...legal, starters: [...legal.starters.slice(0, 10), 12], bench: [legal.starters[10]!, 13, 14, 15] };
    expect(lineupProblems(twoKeepers, players).join(" ")).toMatch(/one goalkeeper/);
  });

  it("rejects a captain on the bench", () => {
    expect(lineupProblems({ ...legal, captain: 13 }, players).join(" ")).toMatch(/captain must start/);
  });
});

describe("rateLineup", () => {
  it("scores the best XI a 10", () => {
    const players = pool({ 11: 9 });
    const best = bestLineup(players);
    expect(rateLineup(best, players).rating).toBe(10);
  });

  it("scores lower, and says why, when a strong player is benched and the captain is weak", () => {
    const players = pool({ 11: 9, 14: 7, 2: 1 });
    const weak = { ...planOf(squad), captain: 2, vice: 11 };
    const rating = rateLineup(weak, players);
    expect(rating.rating).toBeLessThan(10);
    expect(rating.expectedPoints).toBeLessThan(rating.bestExpectedPoints);
    expect(rating.issues.join(" ")).toMatch(/Captain Kayode/);
    expect(rating.issues.join(" ")).toMatch(/João Pedro/);
  });

  it("counts the captain twice", () => {
    const players = pool();
    const lineup = planOf(squad);
    const sum = lineup.starters.reduce((acc, id) => acc + expectedPoints(players.find((p) => p.fplId === id)!.card), 0);
    const captain = expectedPoints(players.find((p) => p.fplId === lineup.captain)!.card);
    expect(lineupPoints(lineup, players)).toBeCloseTo(sum + captain, 1);
  });
});

describe("team plans", () => {
  const salah = card({ fplId: 103, webName: "Salah", team: "LIV", position: "MID", priceM: 13 });
  const incoming = new Map([[103, squadPlayerFromCard(salah, 14)]]);

  it("an unchanged plan is empty and describes nothing", () => {
    expect(isEmptyPlan(squad, planOf(squad))).toBe(true);
    expect(describePlan(squad, planOf(squad), new Map())).toEqual([]);
  });

  it("applies a transfer: the new player takes the old one's place, and the bank moves", () => {
    const base = planOf(squad);
    const plan: TeamPlan = { ...base, starters: base.starters.map((id) => (id === 7 ? 103 : id)), transfers: [{ out: 7, in: 103 }] };
    const after = applyPlan(squad, plan, incoming)!;
    expect(after.starters.map((p) => p.webName)).toContain("Salah");
    expect(after.starters.map((p) => p.webName)).not.toContain("Rogers");
    expect(after.bankM).toBeCloseTo(squad.bankM + 8 - 13, 1);
    expect(describePlan(squad, plan, incoming)).toEqual(["Transfer: Rogers out, Salah in (£8.0m → £13.0m)"]);
  });

  it("describes captaincy and bench moves in plain words", () => {
    const base = planOf(squad);
    // Before: Haaland (11) captain, Kayode (2) vice. Swap Kayode for O'Reilly (13), captain Rogers.
    const plan: TeamPlan = {
      ...base,
      starters: base.starters.map((id) => (id === 2 ? 13 : id)),
      bench: base.bench.map((id) => (id === 13 ? 2 : id)),
      captain: 7,
      vice: 11,
    };
    expect(base.vice).toBe(2);
    expect(describePlan(squad, plan, new Map())).toEqual([
      "Start: O'Reilly",
      "Bench: Kayode",
      "Captain: Haaland → Rogers",
      "Vice-captain: Kayode → Haaland",
    ]);
  });

  it("refuses a plan whose captain is on the bench", () => {
    const base = planOf(squad);
    expect(applyPlan(squad, { ...base, captain: base.bench[1]! }, new Map())).toBeNull();
  });

  it("refuses a plan with an unknown player rather than drawing it", () => {
    const base = planOf(squad);
    expect(applyPlan(squad, { ...base, starters: [...base.starters.slice(0, 10), 999] }, new Map())).toBeNull();
  });
});
