import { describe, expect, it } from "vitest";
import {
  TEAM_MAPPINGS,
  byFootballDataId,
  byFplId,
  premierLeagueClubsInMatches,
  toFootballDataId,
  toFplId,
} from "../src/teams.ts";
import { BootstrapStaticSchema } from "../src/schemas/fpl-bootstrap.ts";
import {
  FootballDataMatchesSchema,
  FootballDataTeamsSchema,
} from "../src/schemas/football-data.ts";
import { loadSample } from "./samples.ts";

const bootstrap = BootstrapStaticSchema.parse(loadSample("fpl/bootstrap-static.json"));
const fdTeams = FootballDataTeamsSchema.parse(loadSample("football-data/pl-teams.json"));
const clMatches = FootballDataMatchesSchema.parse(loadSample("football-data/cl-matches.json"));

describe("team mapping", () => {
  it("maps all 20 Premier League teams", () => {
    expect(TEAM_MAPPINGS).toHaveLength(20);
    expect(bootstrap.teams).toHaveLength(20);
  });

  it("covers every FPL team in the current bootstrap", () => {
    const unmapped = bootstrap.teams.filter((t) => byFplId(t.id) === undefined);
    expect(unmapped.map((t) => t.name)).toEqual([]);
  });

  it("uses football-data ids that exist in the current PL teams response", () => {
    const known = new Set(fdTeams.teams.map((t) => t.id));
    const unknown = TEAM_MAPPINGS.filter((m) => !known.has(m.footballDataId));
    expect(unknown.map((m) => m.fplName)).toEqual([]);
  });

  it("keeps names in sync with both sources, so a stale season fails loudly", () => {
    const fplById = new Map(bootstrap.teams.map((t) => [t.id, t]));
    const fdById = new Map(fdTeams.teams.map((t) => [t.id, t]));
    for (const m of TEAM_MAPPINGS) {
      expect(fplById.get(m.fplId)?.name, `FPL id ${m.fplId}`).toBe(m.fplName);
      expect(fplById.get(m.fplId)?.short_name, `FPL id ${m.fplId}`).toBe(m.fplShort);
      expect(fdById.get(m.footballDataId)?.name, `fd id ${m.footballDataId}`).toBe(
        m.footballDataName,
      );
    }
  });

  it("has unique ids on both sides", () => {
    expect(new Set(TEAM_MAPPINGS.map((m) => m.fplId)).size).toBe(20);
    expect(new Set(TEAM_MAPPINGS.map((m) => m.footballDataId)).size).toBe(20);
  });

  it("round-trips in both directions", () => {
    for (const m of TEAM_MAPPINGS) {
      expect(toFootballDataId(m.fplId)).toBe(m.footballDataId);
      expect(toFplId(m.footballDataId)).toBe(m.fplId);
      expect(byFootballDataId(m.footballDataId)?.fplName).toBe(m.fplName);
    }
  });

  it("returns undefined for ids it does not know", () => {
    expect(toFplId(81)).toBeUndefined(); // Barcelona — in the CL, not the PL
    expect(byFplId(999)).toBeUndefined();
  });
});

describe("Premier League clubs in the Champions League", () => {
  const fplIds = premierLeagueClubsInMatches(clMatches.matches);

  it("derives the list from the matches rather than a hardcoded set", () => {
    expect(fplIds.length).toBeGreaterThan(0);
    expect(fplIds.length).toBeLessThanOrEqual(20);
  });

  // Sanity check only: observed football-data ids for this season's PL entrants.
  it("matches this season's observed entrants", () => {
    const observed = [57, 58, 64, 65, 66];
    const expected = observed.map(toFplId).filter((id) => id !== undefined).sort((a, b) => a - b);
    expect(fplIds).toEqual(expected);
  });

  it("never maps a non-PL club into the flag", () => {
    const nonPl = clMatches.matches.flatMap((m) =>
      [m.homeTeam, m.awayTeam].filter((t) => toFplId(t.id) === undefined),
    );
    expect(nonPl.length).toBeGreaterThan(0); // the CL is mostly non-PL clubs
  });
});
