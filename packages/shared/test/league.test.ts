import { describe, expect, it } from "vitest";
import { leagueSpy, parseLeagueInput, type LeagueStandings, type PlayerName, type RivalPicks } from "../src/index.ts";

const names = new Map<number, PlayerName>(
  [[1, "Haaland"], [2, "Saka"], [3, "Palmer"], [4, "Gross"], [5, "Raya"], [6, "Mbeumo"]].map(([id, name]) => [id as number, { name: name as string, team: "X", teamCode: 1, position: "MID" }]),
);
const row = (entry: number, rank: number, last: number) => ({ entry, entry_name: `T${entry}`, player_name: `M${entry}`, rank, last_rank: last, event_total: 50, total: 500 - rank });
const standings: LeagueStandings = { league: { id: 9, name: "Office" }, standings: { has_next: false, results: [row(10, 1, 2), row(11, 2, 1), row(12, 3, 3), row(13, 4, 4)] } };
const picks = (entry: number, ids: number[], captain: number, chip: string | null = null): RivalPicks => ({ entry, picks: ids, captain, chip });

describe("the mini-league spy", () => {
  const rivals = new Map([
    [10, picks(10, [1, 2, 3], 1)],
    [11, picks(11, [1, 2, 5], 1, "3xc")],
    [12, picks(12, [1, 3, 5], 3)],
    [13, picks(13, [1, 4, 6], 4)],
  ]);

  it("counts captains and ownership over the rivals actually read", () => {
    const spy = leagueSpy(standings, rivals, names);
    expect(spy.analysed).toBe(4);
    expect(spy.captains.map((c) => [c.name, c.count, c.share])).toEqual([["Haaland", 2, 50], ["Gross", 1, 25], ["Palmer", 1, 25]]);
    expect(spy.owned[0]).toMatchObject({ name: "Haaland", share: 100 });
    expect(spy.table[0]).toMatchObject({ team: "T10", move: 1, captain: "Haaland" });
    expect(spy.table[1]).toMatchObject({ move: -1, chip: "3xc" });
    expect(spy.chips).toEqual([{ chip: "3xc", count: 1 }]);
  });

  it("finds your differentials and the players most rivals own that you don't", () => {
    const you = picks(13, [1, 4, 6], 4);
    const spy = leagueSpy(standings, rivals, names, you);
    // You are in the league: shares are out of the other three.
    expect(spy.analysed).toBe(3);
    expect(spy.you!.differentials.map((d) => d.name)).toEqual(["Gross", "Mbeumo"]);
    expect(spy.you!.threats.map((t) => t.name)).toEqual(["Palmer", "Raya", "Saka"]);
    expect(spy.you!.captain).toMatchObject({ name: "Gross", share: 0 });
  });

  it("reads a league ID or a pasted league address", () => {
    expect(parseLeagueInput("1754116")).toBe(1754116);
    expect(parseLeagueInput("https://fantasy.premierleague.com/leagues/1754116/standings/c")).toBe(1754116);
    expect(parseLeagueInput("office")).toBeNull();
  });
});
