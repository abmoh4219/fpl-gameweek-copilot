import { describe, expect, it } from "vitest";
import { buildSquad, comparePlayers, gameweekWrapped, type StatPosition, type StatRow } from "../src/index.ts";
import { cardRows, entry, picks } from "./fixtures.ts";

// Haaland (11) captains with 8 points; Raya (1) scored 7.
const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map([[11, 8], [1, 7], [5, 12]]) });

describe("gameweek wrapped", () => {
  it("tells the gameweek with FPL's numbers, including the captain in hindsight", () => {
    const w = gameweekWrapped(squad, { average: 52, previousOverallRank: 410_000 });
    expect(w.points).toBe(48);
    expect(w.average).toBe(52);
    expect(w.captain).toEqual({ name: "Haaland", points: 16, multiplier: 2 });
    expect(w.bestCaptain).toEqual({ name: "Tavernier", points: 24, isYours: false });
    expect(w.topScorer).toEqual({ name: "Tavernier", points: 12 });
    expect(w.benchPoints).toBe(19);
    expect(w.rankMove).toBe(410_000 - 399_407); // the live entry rank, not the lagging picks one
  });

  it("leaves rank movement out when there is no history", () => {
    expect(gameweekWrapped(squad).rankMove).toBeNull();
  });
});

let id = 1;
function row(webName: string, position: StatPosition, totalPoints: number, minutes = 600): StatRow {
  return {
    fplId: id++, webName, team: "ARS", teamCode: 3, position, priceM: 6, status: "a", minutes, totalPoints, form: totalPoints / 10,
    goals: 1, assists: 1, cleanSheets: 1, bonus: 2, bps: 100, ict: 30, xg: 1, xa: 1, xgi: 2, xg90: 0.1, xa90: 0.1, xgi90: totalPoints / 100,
    defensiveContribution: 10, ownership: 5, netTransfers: 0,
  };
}

describe("player compare", () => {
  it("places players as percentiles among outfield players with real minutes", () => {
    const rows = [row("Low", "MID", 10), row("Mid", "MID", 40), row("Top", "FWD", 80), row("Keeper", "GKP", 90), row("Cameo", "MID", 99, 30)];
    const [top, low] = comparePlayers(rows, [rows[2]!.fplId, rows[0]!.fplId]);
    expect(top!.row.webName).toBe("Top");
    expect(top!.percentiles[0]).toBe(100); // the keeper and the cameo are not in the pool
    expect(low!.percentiles[0]).toBe(33);
    expect(top!.raw[0]).toBe("80");
  });

  it("skips an unknown id", () => {
    expect(comparePlayers([row("A", "MID", 10)], [99_999])).toEqual([]);
  });
});
