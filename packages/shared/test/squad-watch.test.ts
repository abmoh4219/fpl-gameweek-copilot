import { describe, expect, it } from "vitest";
import { buildSquad, squadChanges, squadSnapshot, squadTonight, type WatchRow } from "../src/index.ts";
import { cardRows, entry, picks } from "./fixtures.ts";

const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });
const watch = (fplId: number, percent: number): WatchRow => ({
  fplId, webName: `P${fplId}`, team: "ARS", position: "MID", priceM: 5, percent, direction: percent >= 0 ? "rising" : "falling", strength: 3, overThreshold: false, locked: false,
});

describe("tonight for your squad", () => {
  it("keeps only the squad's players past the threshold, closest first", () => {
    const rows = [watch(7, 62), watch(3, -88), watch(100, 99), watch(5, 20)];
    expect(squadTonight(squad, rows, 50).map((r) => r.fplId)).toEqual([3, 7]);
  });
});

describe("since your last visit", () => {
  it("finds price moves, new flags, cleared flags and squad changes", () => {
    const before = squadSnapshot(squad, "2026-11-01T10:00:00Z");
    const now = squadSnapshot(squad, "2026-11-03T10:00:00Z");
    now.players["7"] = { ...now.players["7"]!, price: 8.1 }; // Rogers rose
    now.players["2"] = { ...now.players["2"]!, status: "d", chance: 75 }; // Kayode flagged
    now.players["8"] = { ...now.players["8"]!, status: "a", chance: null }; // Cherki back
    delete now.players["15"];
    now.players["999"] = { name: "New Guy", price: 4.5, status: "a", chance: null };
    const kinds = squadChanges(before, now).map((c) => `${c.kind}:${c.name}`);
    expect(kinds).toEqual(["flagged:Kayode", "price:Rogers", "cleared:Cherki", "joined:New Guy", "left:Truffert"]);
  });

  it("is empty when nothing moved", () => {
    const s = squadSnapshot(squad, "2026-11-01T10:00:00Z");
    expect(squadChanges(s, { ...s, at: "later" })).toEqual([]);
  });
});
