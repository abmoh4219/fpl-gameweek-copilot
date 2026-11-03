import { describe, expect, it } from "vitest";
import { PRICE_WATCH_COLUMNS, changeDays, closestToChange, watchRowFromView, type ChangeViewRow, type PriceWatchViewRow } from "../src/index.ts";

function view(over: Partial<PriceWatchViewRow>): PriceWatchViewRow {
  return {
    fpl_id: 1, web_name: "Player", element_type: 3, team_short_name: "ARS", price_m: 6, price_change_percent: 50,
    direction: "rising", strongest_likelihood: 3, is_locked: false, is_calibrating: false, ...over,
  };
}

describe("price watch", () => {
  it("never reads the experimental momentum or hourly rate", () => {
    expect(PRICE_WATCH_COLUMNS).not.toContain("momentum");
    expect(PRICE_WATCH_COLUMNS).not.toContain("hourly_rate");
    expect(PRICE_WATCH_COLUMNS).not.toContain("hourly_rate_magnitude");
  });

  it("takes direction from the view and strength in that direction only", () => {
    expect(watchRowFromView(view({ direction: "rising", strongest_likelihood: 4 }))).toMatchObject({ direction: "rising", strength: 4 });
    expect(watchRowFromView(view({ direction: "falling", price_change_percent: -80, strongest_likelihood: -5 }))).toMatchObject({ direction: "falling", strength: 5 });
    // A projection pointing the other way shows no strength rather than a negative one.
    expect(watchRowFromView(view({ direction: "rising", strongest_likelihood: -2 }))!.strength).toBe(0);
  });

  it("flags past-100% as over the threshold, not as a change", () => {
    const r = watchRowFromView(view({ price_change_percent: 103.8 }))!;
    expect(r.overThreshold).toBe(true);
    expect(r.priceM).toBe(6);
  });

  it("drops stable players and unknown positions", () => {
    expect(watchRowFromView(view({ direction: "stable" }))).toBeNull();
    expect(watchRowFromView(view({ element_type: 7 }))).toBeNull();
  });

  it("lists the closest to a change first, in one direction, by position", () => {
    const rows = [
      watchRowFromView(view({ fpl_id: 1, web_name: "Near", price_change_percent: 92 }))!,
      watchRowFromView(view({ fpl_id: 2, web_name: "Far", price_change_percent: 40 }))!,
      watchRowFromView(view({ fpl_id: 3, web_name: "Faller", direction: "falling", price_change_percent: -99 }))!,
      watchRowFromView(view({ fpl_id: 4, web_name: "Keeper", element_type: 1, price_change_percent: 95 }))!,
    ];
    expect(closestToChange(rows, "rising").map((r) => r.webName)).toEqual(["Keeper", "Near", "Far"]);
    expect(closestToChange(rows, "falling").map((r) => r.webName)).toEqual(["Faller"]);
    expect(closestToChange(rows, "rising", "MID").map((r) => r.webName)).toEqual(["Near", "Far"]);
  });
});

describe("confirmed changes", () => {
  const c = (over: Partial<ChangeViewRow>): ChangeViewRow => ({
    fpl_id: 1, web_name: "P", element_type: 3, team_short_name: "ARS", changed_on: "2026-11-02", change_m: 0.1, price_m: 6, direction: "rise", ...over,
  });

  it("groups by night, newest first, biggest moves first", () => {
    const days = changeDays([
      c({ fpl_id: 1, web_name: "Old", changed_on: "2026-11-01" }),
      c({ fpl_id: 2, web_name: "Small", change_m: 0.1 }),
      c({ fpl_id: 3, web_name: "Big", change_m: 0.2 }),
      c({ fpl_id: 4, web_name: "Down", change_m: -0.1, direction: "fall" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(days[0]!.rises.map((r) => r.web_name)).toEqual(["Big", "Small"]);
    expect(days[0]!.falls.map((r) => r.web_name)).toEqual(["Down"]);
  });

  it("keeps only the most recent nights", () => {
    const rows = Array.from({ length: 10 }, (_, i) => c({ fpl_id: i, changed_on: `2026-10-${String(20 + i).padStart(2, "0")}` }));
    expect(changeDays(rows, 3).map((d) => d.date)).toEqual(["2026-10-29", "2026-10-28", "2026-10-27"]);
  });
});
