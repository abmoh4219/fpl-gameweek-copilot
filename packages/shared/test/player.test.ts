import { describe, expect, it } from "vitest";
import { gameweekSeries, minutesShare, pointsBreakdown, priceHistory, type GameweekViewRow } from "../src/index.ts";

function gw(over: Partial<GameweekViewRow>): GameweekViewRow {
  return {
    fpl_id: 1, gameweek: 1, minutes: 90, total_points: 2, goals_scored: 0, assists: 0, clean_sheets: 0, bonus: 0,
    expected_goals: "0.10", expected_assists: "0.05", expected_goal_involvements: "0.15", defensive_contribution: 0,
    points_breakdown: { minutes: 2 }, ...over,
  };
}

describe("player page", () => {
  it("orders the gameweeks and reads string xG as numbers", () => {
    const s = gameweekSeries([gw({ gameweek: 3, total_points: 12, expected_goal_involvements: "1.20" }), gw({ gameweek: 1 })]);
    expect(s.map((p) => p.gameweek)).toEqual([1, 3]);
    expect(s[1]).toMatchObject({ points: 12, xgi: 1.2 });
  });

  it("adds up FPL's breakdown, keeps deductions apart, and the parts sum to the total", () => {
    const b = pointsBreakdown([
      gw({ points_breakdown: { minutes: 2, goals_scored: 8, bonus: 3 }, total_points: 13 }),
      gw({ gameweek: 2, points_breakdown: { minutes: 2, assists: 3, yellow_cards: -1 }, total_points: 4 }),
    ]);
    expect(b.parts.map((p) => [p.label, p.points])).toEqual([
      ["Playing time", 4],
      ["Goals", 8],
      ["Assists", 3],
      ["Bonus", 3],
    ]);
    expect(b.deductions).toEqual([{ id: "yellow_cards", label: "Yellow cards", points: -1 }]);
    expect(b.total).toBe(17);
  });

  it("puts a stat FPL adds later under Other rather than dropping it", () => {
    const b = pointsBreakdown([gw({ points_breakdown: { minutes: 2, mystery_stat: 2 } })]);
    expect(b.parts.at(-1)).toEqual({ id: "other", label: "Other", points: 2 });
  });

  it("rebuilds the price line by undoing changes from today's price", () => {
    const h = priceHistory(7.0, [{ changed_on: "2026-10-20", change_m: 0.1 }, { changed_on: "2026-10-30", change_m: 0.2 }], "2026-11-03");
    expect(h).toEqual([
      { date: "2026-10-19", priceM: 6.7 },
      { date: "2026-10-20", priceM: 6.8 },
      { date: "2026-10-29", priceM: 6.8 },
      { date: "2026-10-30", priceM: 7.0 },
      { date: "2026-11-03", priceM: 7.0 },
    ]);
  });

  it("a price that never moved is a flat line from today", () => {
    expect(priceHistory(5.5, [], "2026-11-03")).toEqual([{ date: "2026-11-03", priceM: 5.5 }]);
  });

  it("minutes share is capped between 0 and 1", () => {
    expect(minutesShare(810, 9)).toBe(1);
    expect(minutesShare(405, 9)).toBe(0.5);
    expect(minutesShare(10, 0)).toBe(0);
  });
});
