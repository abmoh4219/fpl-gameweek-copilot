import { describe, expect, it } from "vitest";
import { INSIGHT_CONFIG, LEADERBOARDS, formatStat, leaderboard, statRowFromView, type StatRow, type StatViewRow } from "../src/index.ts";

const board = (id: string) => LEADERBOARDS.find((b) => b.id === id)!;

function row(over: Partial<StatRow>): StatRow {
  return {
    fplId: 1, webName: "Player", team: "ARS", teamCode: 3, position: "MID", priceM: 6, status: "a", minutes: 900,
    totalPoints: 50, form: 4, goals: 0, assists: 0, cleanSheets: 0, bonus: 0, bps: 0, ict: 0, xg: 0, xa: 0, xgi: 0,
    xg90: 0, xa90: 0, xgi90: 0, defensiveContribution: 0, ownership: 5, netTransfers: 0,
    ...over,
  };
}

describe("leaderboards", () => {
  it("ranks by the board's value, best first", () => {
    const rows = [row({ fplId: 1, webName: "A", goals: 3 }), row({ fplId: 2, webName: "B", goals: 9 }), row({ fplId: 3, webName: "C", goals: 5 })];
    expect(leaderboard(rows, board("goals")).map((r) => r.webName)).toEqual(["B", "C", "A"]);
  });

  it("breaks ties by season points, then by name, so the order is stable", () => {
    const rows = [
      row({ fplId: 1, webName: "Zed", goals: 4, totalPoints: 40 }),
      row({ fplId: 2, webName: "Amy", goals: 4, totalPoints: 40 }),
      row({ fplId: 3, webName: "Bo", goals: 4, totalPoints: 60 }),
    ];
    expect(leaderboard(rows, board("goals")).map((r) => r.webName)).toEqual(["Bo", "Amy", "Zed"]);
  });

  it("never ranks a per-90 rate without minutes behind it", () => {
    const { minMinutesPer90 } = INSIGHT_CONFIG.stats;
    const cameo = row({ fplId: 1, webName: "Cameo", minutes: 3, xgi90: 12.9 });
    const regular = row({ fplId: 2, webName: "Regular", minutes: minMinutesPer90, xgi90: 0.8 });
    expect(leaderboard([cameo, regular], board("xgi90")).map((r) => r.webName)).toEqual(["Regular"]);
    // The season-total boards still count the cameo.
    expect(leaderboard([cameo, regular], board("points")).map((r) => r.webName)).toContain("Cameo");
  });

  it("filters by position and by maximum price", () => {
    const rows = [
      row({ fplId: 1, webName: "Cheap mid", position: "MID", priceM: 5.5, goals: 2 }),
      row({ fplId: 2, webName: "Dear mid", position: "MID", priceM: 12.5, goals: 8 }),
      row({ fplId: 3, webName: "Striker", position: "FWD", priceM: 7, goals: 6 }),
    ];
    expect(leaderboard(rows, board("goals"), { position: "MID" }).map((r) => r.webName)).toEqual(["Dear mid", "Cheap mid"]);
    expect(leaderboard(rows, board("goals"), { maxPriceM: 7 }).map((r) => r.webName)).toEqual(["Striker", "Cheap mid"]);
  });

  it("keeps position-only boards to the positions they make sense for", () => {
    const rows = [row({ fplId: 1, webName: "Keeper", position: "GKP", cleanSheets: 4 }), row({ fplId: 2, webName: "Winger", position: "MID", cleanSheets: 6 })];
    expect(leaderboard(rows, board("cs")).map((r) => r.webName)).toEqual(["Keeper"]);
  });

  it("computes points per million from points and price", () => {
    const rows = [row({ fplId: 1, webName: "Value", totalPoints: 60, priceM: 4.5 }), row({ fplId: 2, webName: "Premium", totalPoints: 90, priceM: 14 })];
    expect(leaderboard(rows, board("value"))[0]!.webName).toBe("Value");
  });

  it("caps the table length", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ fplId: i + 1, webName: `P${i}`, goals: i }));
    expect(leaderboard(rows, board("goals"))).toHaveLength(INSIGHT_CONFIG.stats.rows);
  });
});

describe("reading the view", () => {
  it("converts the view's strings and numbers, and maps the position", () => {
    const view = {
      fpl_id: 430, web_name: "Haaland", team_short_name: "MCI", team_code: 43, element_type: 4, price_m: 15.8, status: "a",
      minutes: 810, total_points: 92, form: "8.5", goals_scored: 11, assists: 2, clean_sheets: 3, bonus: 14, bps: 320,
      ict_index: "120.4", expected_goals: "9.84", expected_assists: "1.20", expected_goal_involvements: "11.04",
      expected_goals_per_90: 1.09, expected_assists_per_90: 0.13, expected_goal_involvements_per_90: 1.23,
      defensive_contribution: 20, selected_by_percent: "61.3", net_transfers_event: -1200,
    } satisfies StatViewRow;
    const r = statRowFromView(view)!;
    expect(r).toMatchObject({ position: "FWD", form: 8.5, xg: 9.84, ownership: 61.3, ict: 120.4, netTransfers: -1200 });
  });

  it("drops a row with an unknown position", () => {
    const bad = { fpl_id: 1, web_name: "X", element_type: 9 } as unknown as StatViewRow;
    expect(statRowFromView(bad)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats each kind of figure", () => {
    expect(formatStat(12, "int")).toBe("12");
    expect(formatStat(0.876, "dec2")).toBe("0.88");
    expect(formatStat(61.25, "pct")).toBe("61.3%");
    expect(formatStat(15230, "signed")).toBe("+15,230");
    expect(formatStat(-800, "signed")).toBe("-800");
  });
});

describe("chart data", () => {
  it("finishing: labels the biggest over- and under-performers, and ignores cameos and keepers", async () => {
    const { finishingChart } = await import("../src/index.ts");
    const rows = [
      row({ fplId: 1, webName: "Lucky", goals: 9, xg: 4 }),
      row({ fplId: 2, webName: "Unlucky", goals: 1, xg: 6 }),
      row({ fplId: 3, webName: "Fair", goals: 5, xg: 5 }),
      row({ fplId: 4, webName: "Cameo", goals: 2, xg: 0.1, minutes: 20 }),
      row({ fplId: 5, webName: "Keeper", position: "GKP", goals: 0, xg: 0.01 }),
    ];
    const pts = finishingChart(rows);
    expect(pts.map((p) => p.label).sort()).toEqual(["Fair", "Lucky", "Unlucky"]);
    expect(pts.find((p) => p.label === "Lucky")).toMatchObject({ tone: "hi", labelled: true, x: 4, y: 9 });
    expect(pts.find((p) => p.label === "Unlucky")).toMatchObject({ tone: "lo", labelled: true });
    expect(pts.find((p) => p.label === "Fair")).toMatchObject({ tone: "base", labelled: false });
  });

  it("value: highlights the most points per million", async () => {
    const { valueChart } = await import("../src/index.ts");
    const rows = Array.from({ length: 10 }, (_, i) => row({ fplId: i + 1, webName: `P${i}`, priceM: 10 - i * 0.5, totalPoints: 40 }));
    const hi = valueChart(rows).filter((p) => p.tone === "hi").map((p) => p.label);
    // Same points, cheaper is better value: the cheapest are the picks.
    expect(hi).toContain("P9");
    expect(hi).not.toContain("P0");
  });

  it("differentials: only players under the ownership line can be picks", async () => {
    const { differentialChart } = await import("../src/index.ts");
    const rows = [
      row({ fplId: 1, webName: "Template", ownership: 55, form: 9 }),
      row({ fplId: 2, webName: "Hidden gem", ownership: 3.2, form: 7.5 }),
      row({ fplId: 3, webName: "Unowned", ownership: 0, form: 2 }),
    ];
    const pts = differentialChart(rows);
    expect(pts.find((p) => p.label === "Template")!.tone).toBe("base");
    expect(pts.find((p) => p.label === "Hidden gem")!.tone).toBe("hi");
    // 0% is drawn at the log axis floor rather than vanishing.
    expect(pts.find((p) => p.label === "Unowned")!.x).toBeGreaterThan(0);
  });

  it("headlines: one leader per measure", async () => {
    const { statHeadlines } = await import("../src/index.ts");
    const rows = [row({ fplId: 1, webName: "Scorer", goals: 9, ownership: 20 }), row({ fplId: 2, webName: "Popular", goals: 2, ownership: 60 })];
    const h = statHeadlines(rows);
    expect(h.find((x) => x.id === "goals")!.row.webName).toBe("Scorer");
    expect(h.find((x) => x.id === "owned")).toMatchObject({ value: "60.0%" });
  });
});
