import { describe, expect, it } from "vitest";
import { templateXi, transferRadar, type StatPosition, type StatRow } from "../src/index.ts";

let id = 1;
function row(webName: string, position: StatPosition, ownership: number, netTransfers = 0): StatRow {
  return {
    fplId: id++, webName, team: "ARS", teamCode: 3, position, priceM: 5, status: "a", minutes: 600, totalPoints: 40, form: 4,
    goals: 1, assists: 1, cleanSheets: 1, bonus: 2, bps: 100, ict: 30, xg: 1, xa: 1, xgi: 2, xg90: 0.1, xa90: 0.1, xgi90: 0.2,
    defensiveContribution: 10, ownership, netTransfers,
  };
}

describe("the transfer radar", () => {
  it("lists the biggest net transfers in and out, biggest first, and never a zero", () => {
    const rows = [row("A", "MID", 5, 90_000), row("B", "FWD", 5, -120_000), row("C", "DEF", 5, 300_000), row("D", "MID", 5, 0), row("E", "MID", 5, -5)];
    const radar = transferRadar(rows, 2);
    expect(radar.in.map((r) => r.webName)).toEqual(["C", "A"]);
    expect(radar.out.map((r) => r.webName)).toEqual(["B", "E"]);
  });
});

describe("the template XI", () => {
  it("fills FPL's formation rules by ownership", () => {
    const rows = [
      row("GK1", "GKP", 40), row("GK2", "GKP", 30),
      row("D1", "DEF", 50), row("D2", "DEF", 45), row("D3", "DEF", 44), row("D4", "DEF", 43), row("D5", "DEF", 42), row("D6", "DEF", 41),
      row("M1", "MID", 60), row("M2", "MID", 20), row("M3", "MID", 19),
      row("F1", "FWD", 70), row("F2", "FWD", 46), row("F3", "FWD", 45), row("F4", "FWD", 44),
    ];
    const xi = templateXi(rows)!;
    // Forwards cap at 3 and defenders at 5, so the eleventh place goes to the next-best position that has room.
    expect(xi.formation).toBe("5-2-3");
    expect(xi.players.map((p) => p.webName)).toEqual(["GK1", "D1", "D2", "D3", "D4", "D5", "M1", "M2", "F1", "F2", "F3"]);
  });

  it("returns nothing when a position cannot be filled", () => {
    expect(templateXi([row("GK1", "GKP", 40), row("D1", "DEF", 50)])).toBeNull();
  });
});
