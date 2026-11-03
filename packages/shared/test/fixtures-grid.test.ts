import { describe, expect, it } from "vitest";
import { fixtureGrid, sortGrid, type RunScore, type TickerViewRow } from "../src/index.ts";

function t(over: Partial<TickerViewRow>): TickerViewRow {
  return { team_fpl_id: 1, team_short_name: "ARS", gameweek: 10, kickoff_utc: "2026-11-07T15:00:00+00:00", is_home: true, opponent_short_name: "HUL", difficulty: 2, is_blank: false, ...over };
}

const run = (teamFplId: number, next3: number, next5: number): RunScore => ({ teamFplId, teamCode: teamFplId * 10, next3, next5, band3: "Medium", band5: "Medium" });

describe("the fixture grid", () => {
  it("lays every club out over the same gameweeks, in order", () => {
    const ticker = [
      t({ team_fpl_id: 1, gameweek: 11, opponent_short_name: "NEW", is_home: false, difficulty: 3, kickoff_utc: "2026-11-21T17:30:00+00:00" }),
      t({ team_fpl_id: 1, gameweek: 10 }),
      t({ team_fpl_id: 2, team_short_name: "LIV", gameweek: 10, opponent_short_name: "BRE", difficulty: 2 }),
      t({ team_fpl_id: 2, team_short_name: "LIV", gameweek: 11, opponent_short_name: "MCI", difficulty: 4 }),
    ];
    const { gameweeks, rows } = fixtureGrid(ticker, [run(1, 2.5, 2.8), run(2, 3, 3.2)]);
    expect(gameweeks).toEqual([10, 11]);
    const ars = rows.find((r) => r.team === "ARS")!;
    expect(ars.cells.map((c) => c.fixtures.map((f) => `${f.opponent}${f.isHome ? "(H)" : "(A)"}`))).toEqual([["HUL(H)"], ["NEW(A)"]]);
    expect(ars.teamCode).toBe(10);
  });

  it("shows a blank gameweek as an empty cell and a double as two fixtures, earliest first", () => {
    const ticker = [
      t({ gameweek: 10, is_blank: true, opponent_short_name: null, difficulty: null, kickoff_utc: null }),
      t({ gameweek: 11, opponent_short_name: "MUN", kickoff_utc: "2026-11-25T20:00:00+00:00" }),
      t({ gameweek: 11, opponent_short_name: "BOU", kickoff_utc: "2026-11-22T15:00:00+00:00" }),
    ];
    const { rows } = fixtureGrid(ticker, [run(1, 2, 2)]);
    expect(rows[0]!.cells[0]!.fixtures).toEqual([]);
    expect(rows[0]!.cells[1]!.fixtures.map((f) => f.opponent)).toEqual(["BOU", "MUN"]);
  });

  it("marks only the fixture that comes right after a Champions League match", () => {
    const ticker = [t({ gameweek: 10, kickoff_utc: "2026-11-07T15:00:00+00:00" }), t({ gameweek: 11, kickoff_utc: "2026-11-21T17:30:00+00:00", opponent_short_name: "NEW" })];
    const { rows } = fixtureGrid(ticker, [run(1, 2, 2)], [{ teamFplId: 1, kickoffUtc: "2026-11-07T15:00:00+00:00", daysSinceCl: 2.8 }]);
    expect(rows[0]!.cells.map((c) => c.fixtures[0]!.afterCl)).toEqual([true, false]);
  });

  it("leaves out a club with no computed run rather than inventing one", () => {
    const { rows } = fixtureGrid([t({ team_fpl_id: 1 }), t({ team_fpl_id: 9, team_short_name: "XXX" })], [run(1, 2, 2)]);
    expect(rows.map((r) => r.team)).toEqual(["ARS"]);
  });

  it("sorts by the easiest run, or by name", () => {
    const ticker = [t({ team_fpl_id: 1, team_short_name: "ARS" }), t({ team_fpl_id: 2, team_short_name: "BOU" }), t({ team_fpl_id: 3, team_short_name: "CHE" })];
    const { rows } = fixtureGrid(ticker, [run(1, 3.4, 2.1), run(2, 2.2, 3.5), run(3, 2.9, 2.9)]);
    expect(sortGrid(rows, "next3").map((r) => r.team)).toEqual(["BOU", "CHE", "ARS"]);
    expect(sortGrid(rows, "next5").map((r) => r.team)).toEqual(["ARS", "CHE", "BOU"]);
    expect(sortGrid(rows, "name").map((r) => r.team)).toEqual(["ARS", "BOU", "CHE"]);
  });
});

describe("teams to target", () => {
  it("picks clubs that both create a lot and face easy runs", async () => {
    const { teamTargetChart } = await import("../src/index.ts");
    const teams = [
      { teamFplId: 1, team: "ATT", xg: 20, next5: 3.6 }, // great attack, hard run
      { teamFplId: 2, team: "EZY", xg: 6, next5: 2.0 }, // weak attack, easy run
      { teamFplId: 3, team: "BTH", xg: 18, next5: 2.2 }, // both
      { teamFplId: 4, team: "NON", xg: 5, next5: 3.8 }, // neither
    ];
    const pts = teamTargetChart(teams, 1);
    expect(pts.filter((p) => p.tone === "hi").map((p) => p.label)).toEqual(["BTH"]);
    expect(pts.find((p) => p.label === "NON")!.sub).toBe("Attack rank 4 · fixtures rank 4");
  });
});

describe("fixture swings", () => {
  it("finds runs that turn easier or harder, skipping blanks and averaging doubles", async () => {
    const { fixtureGrid, fixtureSwings } = await import("../src/index.ts");
    const cells = (team: number, short: string, ds: (number | null | [number, number])[]) =>
      ds.flatMap((d, i) =>
        d === null
          ? [t({ team_fpl_id: team, team_short_name: short, gameweek: 10 + i, is_blank: true, opponent_short_name: null, difficulty: null, kickoff_utc: null })]
          : Array.isArray(d)
            ? d.map((x, k) => t({ team_fpl_id: team, team_short_name: short, gameweek: 10 + i, difficulty: x, kickoff_utc: `2026-11-${10 + i}T1${k}:00:00+00:00` }))
            : [t({ team_fpl_id: team, team_short_name: short, gameweek: 10 + i, difficulty: d })],
      );
    const ticker = [
      ...cells(1, "UPP", [5, 4, 2, 2, 2]), // hard now, easy later
      ...cells(2, "DWN", [2, 2, 4, 5, 4]), // easy now, hard later
      ...cells(3, "FLT", [3, 3, 3, null, [2, 4]]), // steady, with a blank and a double
    ];
    const { rows } = fixtureGrid(ticker, [run(1, 3, 3), run(2, 3, 3), run(3, 3, 3)]);
    const swings = fixtureSwings(rows);
    expect(swings.map((s) => [s.team, s.direction])).toEqual([
      ["UPP", "easier"],
      ["FLT", "steady"],
      ["DWN", "harder"],
    ]);
    const flt = swings.find((s) => s.team === "FLT")!;
    expect(flt.difficulty).toEqual([3, 3, 3, null, 3]);
    expect(swings.find((s) => s.team === "UPP")!.swing).toBe(2.5);
  });
});
