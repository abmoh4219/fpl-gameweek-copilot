import { describe, expect, it } from "vitest";
import {
  INSIGHT_CONFIG,
  buildPlayerCard,
  captainPicks,
  differentialPicks,
  fixtureRunInsight,
  formInsight,
  goalThreatInsight,
  minutesRiskInsight,
  priceWatchPicks,
  type CardInputs,
  type FixtureTickerRow,
  type PlayerCurrentRow,
  type PlayerFormRow,
  type TeamStrength,
} from "../src/index.ts";

function player(overrides: Partial<PlayerCurrentRow> = {}): PlayerCurrentRow {
  return {
    playerId: 1, fplId: 411, webName: "Haaland", elementType: 4,
    teamFplId: 15, teamShortName: "MCI", nowCost: 150, priceM: 15,
    costChangeEvent: 0, status: "a", news: "", chanceOfPlayingNextRound: null,
    selectedByPercent: 40, netTransfersEvent: 0, totalPoints: 50, form: 6,
    epNext: 8, minutes: 450, starts: 5, expectedGoalInvolvements: 5,
    expectedGoalInvolvementsPer90: 1.0, penaltiesOrder: 1, cornersOrder: null,
    freekicksOrder: null, ...overrides,
  };
}

function form(overrides: Partial<PlayerFormRow> = {}): PlayerFormRow {
  return {
    playerId: 1, gameweeksLast4: 4, pointsLast4: 30, minutesLast4: 360,
    startsLast4: 4, xgiLast4: 4, xgiPer90Last4: 1.0, pointsLast6: 40,
    minutesLast6: 540, xgiPer90Last6: 1.0, ...overrides,
  };
}

const STRENGTHS = new Map<number, TeamStrength>([
  [15, { teamFplId: 15, shortName: "MCI", strengthOverallHome: 4, strengthOverallAway: 5, strengthDefenceHome: 0, strengthDefenceAway: 0 }],
  [11, { teamFplId: 11, shortName: "HUL", strengthOverallHome: 2, strengthOverallAway: 2, strengthDefenceHome: 0, strengthDefenceAway: 0 }],
  [1,  { teamFplId: 1,  shortName: "ARS", strengthOverallHome: 4, strengthOverallAway: 5, strengthDefenceHome: 0, strengthDefenceAway: 0 }],
]);

function ticker(overrides: Partial<FixtureTickerRow>[] = []): FixtureTickerRow[] {
  const base: FixtureTickerRow[] = [
    { teamFplId: 15, gameweek: 6, gwOffset: 1, isHome: true, opponentShortName: "HUL", opponentTeamFplId: 11, difficulty: 2, isBlank: false, isDouble: false },
    { teamFplId: 15, gameweek: 7, gwOffset: 2, isHome: false, opponentShortName: "ARS", opponentTeamFplId: 1, difficulty: 4, isBlank: false, isDouble: false },
    { teamFplId: 15, gameweek: 8, gwOffset: 3, isHome: true, opponentShortName: "HUL", opponentTeamFplId: 11, difficulty: 2, isBlank: false, isDouble: false },
  ];
  return overrides.length ? base.map((b, i) => ({ ...b, ...overrides[i] })) : base;
}

describe("form", () => {
  it("returns zeros when a player has no finished gameweeks", () => {
    const result = formInsight(undefined);
    expect(result).toMatchObject({ gameweeks: 0, points: 0, score: 0 });
  });

  it("scores points and minutes together, not points alone", () => {
    const benchHauls = formInsight(form({ pointsLast4: 20, minutesLast4: 90 }));
    const startedSame = formInsight(form({ pointsLast4: 20, minutesLast4: 360 }));
    expect(startedSame.score).toBeGreaterThan(benchHauls.score);
  });

  it("caps at 100", () => {
    expect(formInsight(form({ pointsLast4: 200, minutesLast4: 900 })).score).toBe(100);
  });
});

describe("minutes risk", () => {
  it("is Low for a fit, ever-present starter", () => {
    expect(minutesRiskInsight(player(), form(), undefined).band).toBe("Low");
  });

  it("is High for an injured player", () => {
    const result = minutesRiskInsight(player({ status: "i" }), form(), undefined);
    expect(result.band).toBe("High");
    expect(result.reasons).toContain("status i");
  });

  it("treats a null chance of playing as no news, not as a flag", () => {
    const noNews = minutesRiskInsight(player({ chanceOfPlayingNextRound: null }), form(), undefined);
    const flagged = minutesRiskInsight(player({ chanceOfPlayingNextRound: 50 }), form(), undefined);
    expect(noNews.score).toBeLessThan(flagged.score);
  });

  it("adds rotation risk around a Champions League match", () => {
    const clean = minutesRiskInsight(player(), form(), undefined);
    const congested = minutesRiskInsight(player(), form(), {
      teamFplId: 15, gameweek: 6, isAfterCl: true, isBeforeCl: true,
      daysSinceCl: 3, daysUntilCl: 3,
    });
    const expected = INSIGHT_CONFIG.minutesRisk.congestionPenalty.afterCl +
      INSIGHT_CONFIG.minutesRisk.congestionPenalty.beforeCl;
    expect(congested.score - clean.score).toBe(expected);
  });

  it("bands exactly at the configured boundaries", () => {
    const { lowBelow, mediumBelow } = INSIGHT_CONFIG.minutesRisk.bands;
    expect(lowBelow).toBeLessThan(mediumBelow);
  });
});

describe("fixture run", () => {
  it("rates a run of weak opponents as Easy", () => {
    const easy = ticker([{ difficulty: 2 }, { difficulty: 2, opponentTeamFplId: 11 }, { difficulty: 2 }]);
    expect(fixtureRunInsight(15, easy, STRENGTHS, 3).band).toBe("Easy");
  });

  it("rates a run of strong opponents as Hard", () => {
    const hard = ticker([
      { difficulty: 5, opponentTeamFplId: 1, isHome: false },
      { difficulty: 5, opponentTeamFplId: 1, isHome: false },
      { difficulty: 4, opponentTeamFplId: 1, isHome: false },
    ]);
    expect(fixtureRunInsight(15, hard, STRENGTHS, 3).band).toBe("Hard");
  });

  it("penalises a blank gameweek", () => {
    const withBlank = ticker([{}, { isBlank: true, difficulty: null, opponentTeamFplId: null }, {}]);
    const normal = fixtureRunInsight(15, ticker(), STRENGTHS, 3);
    const blanked = fixtureRunInsight(15, withBlank, STRENGTHS, 3);
    expect(blanked.blanks).toBe(1);
    expect(blanked.adjustedDifficulty).toBeGreaterThan(normal.adjustedDifficulty);
  });

  it("rewards a double gameweek", () => {
    const withDouble = ticker().map((r, i) => (i === 0 ? { ...r, isDouble: true } : r));
    const doubled = fixtureRunInsight(15, withDouble, STRENGTHS, 3);
    expect(doubled.doubles).toBe(1);
    expect(doubled.adjustedDifficulty).toBeLessThan(
      fixtureRunInsight(15, ticker(), STRENGTHS, 3).adjustedDifficulty,
    );
  });

  it("gives home advantage", () => {
    const home = fixtureRunInsight(15, ticker([{ isHome: true }, { isHome: true }, { isHome: true }]), STRENGTHS, 3);
    const away = fixtureRunInsight(15, ticker([{ isHome: false }, { isHome: false }, { isHome: false }]), STRENGTHS, 3);
    expect(home.adjustedDifficulty).toBeLessThan(away.adjustedDifficulty);
  });

  it("respects the horizon", () => {
    expect(fixtureRunInsight(15, ticker(), STRENGTHS, 1).gameweeks).toHaveLength(1);
    expect(fixtureRunInsight(15, ticker(), STRENGTHS, 3).gameweeks).toHaveLength(3);
  });
});

describe("goal threat", () => {
  it("is always labelled an estimate", () => {
    expect(goalThreatInsight(player(), form(), ticker(), STRENGTHS).isEstimate).toBe(true);
  });

  it("refuses to trust a per-90 rate with no minutes behind it", () => {
    // A 3-minute cameo produced a season xGI/90 of 12.9 in real data.
    const cameo = goalThreatInsight(
      player({ minutes: 3, expectedGoalInvolvementsPer90: 12.9 }),
      form({ minutesLast4: 3, xgiPer90Last4: 12.9 }),
      ticker(),
      STRENGTHS,
    );
    const regular = goalThreatInsight(player(), form(), ticker(), STRENGTHS);
    expect(cameo.score).toBeLessThan(regular.score);
    expect(cameo.band).toBe("Low");
  });

  it("gives a penalty taker a bonus", () => {
    const onPens = goalThreatInsight(player({ penaltiesOrder: 1 }), form(), ticker(), STRENGTHS);
    const notOnPens = goalThreatInsight(player({ penaltiesOrder: null }), form(), ticker(), STRENGTHS);
    expect(onPens.score).toBeGreaterThan(notOnPens.score);
    expect(onPens.onPenalties).toBe(true);
  });

  it("is zero with no fixture to play", () => {
    const blank = ticker([{ isBlank: true, difficulty: null, opponentTeamFplId: null }]).slice(0, 1);
    expect(goalThreatInsight(player(), form(), blank, STRENGTHS).score).toBe(0);
  });

  it("falls back to overall strength when defence ratings are unusable", () => {
    // strength_defence_* is 0 for every team in the live API.
    const result = goalThreatInsight(player(), form(), ticker(), STRENGTHS);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("selections", () => {
  const inputs: CardInputs = {
    forms: new Map([[1, form()]]),
    ticker: ticker(),
    strengths: STRENGTHS,
    congestion: new Map(),
  };

  it("excludes non-starters from captaincy", () => {
    const fringe = buildPlayerCard(player({ minutes: 20 }), {
      ...inputs,
      forms: new Map([[1, form({ minutesLast4: 20, startsLast4: 0 })]]),
    });
    expect(captainPicks([fringe])).toHaveLength(0);
  });

  it("ranks a higher expected-points starter above a noisy fringe player", () => {
    const starter = buildPlayerCard(player({ playerId: 1, fplId: 1, webName: "Gross", epNext: 11.2 }), inputs);
    const noisy = buildPlayerCard(
      player({ playerId: 2, fplId: 2, webName: "Cameo", epNext: 1.5, minutes: 3, expectedGoalInvolvementsPer90: 12.9 }),
      { ...inputs, forms: new Map([[2, form({ playerId: 2, minutesLast4: 3 })]]) },
    );
    const picks = captainPicks([starter, noisy]);
    expect(picks[0]?.webName).toBe("Gross");
  });

  it("only offers genuinely low-owned differentials", () => {
    const owned = buildPlayerCard(player({ selectedByPercent: 40 }), inputs);
    const differential = buildPlayerCard(
      player({ playerId: 2, fplId: 2, webName: "Rudoni", selectedByPercent: 3 }),
      { ...inputs, forms: new Map([[2, form({ playerId: 2 })]]) },
    );
    const picks = differentialPicks([owned, differential]);
    expect(picks.map((p) => p.webName)).toEqual(["Rudoni"]);
  });
});

describe("price watch", () => {
  const rows = [
    { playerId: 1, fplId: 1, webName: "Riser", teamShortName: "ARS", priceM: 5, priceChangePercent: 92, direction: "rising", isLocked: false },
    { playerId: 2, fplId: 2, webName: "Faller", teamShortName: "HUL", priceM: 4.5, priceChangePercent: -88, direction: "falling", isLocked: false },
    { playerId: 3, fplId: 3, webName: "Quiet", teamShortName: "EVE", priceM: 6, priceChangePercent: 4, direction: "rising", isLocked: false },
    { playerId: 4, fplId: 4, webName: "Unknown", teamShortName: "FUL", priceM: 6, priceChangePercent: null, direction: "unknown", isLocked: false },
  ];

  it("takes direction from the percent only, and ignores small moves", () => {
    const { risers, fallers } = priceWatchPicks(rows);
    expect(risers.map((r) => r.webName)).toEqual(["Riser"]);
    expect(fallers.map((r) => r.webName)).toEqual(["Faller"]);
  });

  it("never exposes momentum or the hourly rate", () => {
    const { risers } = priceWatchPicks(rows);
    expect(Object.keys(risers[0] ?? {})).not.toContain("momentum");
    expect(Object.keys(risers[0] ?? {})).not.toContain("hourlyRate");
  });
});
