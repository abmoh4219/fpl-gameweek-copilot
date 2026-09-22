import { describe, expect, it } from "vitest";
import {
  BootstrapStaticSchema,
  ElementSummarySchema,
  EntryPicksSchema,
  EntrySchema,
  EventLiveSchema,
  EventStatusSchema,
  FixturesSchema,
  FootballDataMatchesSchema,
  FootballDataTeamsSchema,
  hasPriceChangeFields,
} from "../src/index.ts";
import { loadSample } from "./samples.ts";

describe("every sample parses", () => {
  it.each([
    ["fpl/bootstrap-static.json", BootstrapStaticSchema],
    ["fpl/fixtures.json", FixturesSchema],
    ["fpl/event-live.json", EventLiveSchema],
    ["fpl/event-status.json", EventStatusSchema],
    ["fpl/element-summary-gk.json", ElementSummarySchema],
    ["fpl/element-summary-mid.json", ElementSummarySchema],
    ["fpl/element-summary-fwd.json", ElementSummarySchema],
    ["fpl/entry.json", EntrySchema],
    ["fpl/entry-picks.json", EntryPicksSchema],
    ["football-data/pl-teams.json", FootballDataTeamsSchema],
    ["football-data/cl-matches.json", FootballDataMatchesSchema],
  ])("%s", (file, schema) => {
    const result = schema.safeParse(loadSample(file));
    if (!result.success) {
      throw new Error(
        `${file} failed to parse:\n` +
          result.error.issues
            .slice(0, 10)
            .map((i) => `  ${i.path.join(".")}: ${i.message}`)
            .join("\n"),
      );
    }
    expect(result.success).toBe(true);
  });
});

const bootstrap = BootstrapStaticSchema.parse(loadSample("fpl/bootstrap-static.json"));
const fixtures = FixturesSchema.parse(loadSample("fpl/fixtures.json"));
const live = EventLiveSchema.parse(loadSample("fpl/event-live.json"));

describe("unknown fields are stripped", () => {
  it("drops keys we do not model", () => {
    const raw = loadSample("fpl/fixtures.json") as Record<string, unknown>[];
    expect(raw[0]).toHaveProperty("pulse_id");
    expect(fixtures[0]).not.toHaveProperty("pulse_id");
  });

  it("fails when a field we DO use has the wrong type", () => {
    const raw = structuredClone(loadSample("fpl/fixtures.json")) as Record<string, unknown>[];
    raw[0]!["team_h_difficulty"] = "2"; // number in the real API
    expect(FixturesSchema.safeParse(raw).success).toBe(false);
  });

  it("fails when a field we DO use is missing", () => {
    const raw = structuredClone(loadSample("fpl/fixtures.json")) as Record<string, unknown>[];
    delete raw[0]!["team_h"];
    expect(FixturesSchema.safeParse(raw).success).toBe(false);
  });
});

describe("string-number conversion", () => {
  it("turns season totals into numbers", () => {
    for (const e of bootstrap.elements.slice(0, 50)) {
      expect(typeof e.selected_by_percent).toBe("number");
      expect(typeof e.form).toBe("number");
      expect(typeof e.expected_goals).toBe("number");
      expect(typeof e.ict_index).toBe("number");
      expect(typeof e.ep_next).toBe("number");
    }
  });

  it("leaves per-90 fields as the numbers they already were", () => {
    for (const e of bootstrap.elements.slice(0, 50)) {
      expect(typeof e.expected_goals_per_90).toBe("number");
      expect(typeof e.defensive_contribution_per_90).toBe("number");
    }
  });

  it("converts the expected stats in event/{gw}/live too", () => {
    for (const e of live.elements.slice(0, 50)) {
      expect(typeof e.stats.expected_goals).toBe("number");
      expect(typeof e.stats.expected_goal_involvements).toBe("number");
    }
  });
});

describe("key fields are in sensible ranges", () => {
  it("prices are plausible, in tenths", () => {
    for (const e of bootstrap.elements) {
      expect(e.now_cost).toBeGreaterThanOrEqual(35);
      expect(e.now_cost).toBeLessThanOrEqual(200);
      expect(Number.isInteger(e.now_cost)).toBe(true);
    }
  });

  it("ownership is a percentage", () => {
    for (const e of bootstrap.elements) {
      expect(e.selected_by_percent).toBeGreaterThanOrEqual(0);
      expect(e.selected_by_percent).toBeLessThanOrEqual(100);
    }
  });

  it("expected stats are non-negative", () => {
    for (const e of bootstrap.elements) {
      expect(e.expected_goals).toBeGreaterThanOrEqual(0);
      expect(e.expected_assists).toBeGreaterThanOrEqual(0);
      expect(e.expected_goal_involvements_per_90).toBeGreaterThanOrEqual(0);
    }
  });

  it("chance of playing is null or a 0-100 percentage", () => {
    for (const e of bootstrap.elements) {
      if (e.chance_of_playing_next_round !== null) {
        expect(e.chance_of_playing_next_round).toBeGreaterThanOrEqual(0);
        expect(e.chance_of_playing_next_round).toBeLessThanOrEqual(100);
      }
    }
  });

  it("fixture difficulty is 1-5 on both sides", () => {
    for (const f of fixtures) {
      expect(f.team_h_difficulty).toBeGreaterThanOrEqual(1);
      expect(f.team_h_difficulty).toBeLessThanOrEqual(5);
      expect(f.team_a_difficulty).toBeGreaterThanOrEqual(1);
      expect(f.team_a_difficulty).toBeLessThanOrEqual(5);
    }
  });

  it("every fixture references two known teams", () => {
    const ids = new Set(bootstrap.teams.map((t) => t.id));
    for (const f of fixtures) {
      expect(ids.has(f.team_h)).toBe(true);
      expect(ids.has(f.team_a)).toBe(true);
    }
  });
});

describe("price-change fields (undocumented, optional)", () => {
  it("are present in today's sample — if this fails, FPL changed the API", () => {
    const missing = bootstrap.elements.filter((e) => !hasPriceChangeFields(e));
    expect(missing.map((e) => e.web_name)).toEqual([]);
  });

  it("percent is a signed number that can exceed 100", () => {
    for (const e of bootstrap.elements) {
      expect(typeof e.price_change_percent).toBe("number");
      expect(Number.isFinite(e.price_change_percent)).toBe(true);
    }
  });

  it("locked_until is null or a timestamp", () => {
    for (const e of bootstrap.elements) {
      const locked = e.price_change_locked_until;
      if (locked != null) expect(Number.isNaN(Date.parse(locked))).toBe(false);
    }
  });

  it("projections carry offsets 0,1,2 with a signed likelihood in -5..5", () => {
    for (const e of bootstrap.elements) {
      const projections = e.price_change_projections ?? [];
      expect(projections.map((p) => p.offset)).toEqual([0, 1, 2]);
      for (const p of projections) {
        expect(Number.isInteger(p.likelihood)).toBe(true);
        expect(p.likelihood).toBeGreaterThanOrEqual(-5);
        expect(p.likelihood).toBeLessThanOrEqual(5);
        expect(Number.isFinite(p.projected_percent)).toBe(true);
      }
    }
  });

  it("parses fine when FPL drops them entirely", () => {
    const raw = structuredClone(loadSample("fpl/bootstrap-static.json")) as {
      elements: Record<string, unknown>[];
    };
    for (const e of raw.elements) {
      delete e["price_change_percent"];
      delete e["price_change_hourly_rate"];
      delete e["price_change_projections"];
      delete e["price_change_locked_until"];
      delete e["price_change_calibrating"];
      delete e["scout_risks"];
    }
    const result = BootstrapStaticSchema.safeParse(raw);
    expect(result.success).toBe(true);
    expect(hasPriceChangeFields(result.data!.elements[0]!)).toBe(false);
  });
});
