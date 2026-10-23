import { describe, expect, it } from "vitest";
import {
  AI_PROSE_LABEL,
  INSIGHT_CONFIG,
  previewDelivery,
  previewFacts,
  previewPrompt,
  renderReport,
  ukDeadlineLabel,
  validateProse,
  withProse,
  type BuiltReport,
  type PlayerCard,
  type ReportPayload,
} from "../src/index.ts";

function card(overrides: Partial<PlayerCard> = {}): PlayerCard {
  return {
    playerId: 1, fplId: 411, webName: "Haaland", team: "MCI", position: "FWD",
    priceM: 15.7, priceChangeEventTenths: 0, ownership: 77.4, netTransfersEvent: 0,
    totalPoints: 60, epNext: 9.5, status: "a", news: "", chanceOfPlayingNextRound: null,
    minutes: 700, starts: 8, xgiPer90: 0.94,
    form: { gameweeks: 4, points: 19, minutes: 360, starts: 4, xgiPer90: 0.9, score: 70 },
    minutesRisk: { band: "Low", score: 0, reasons: [] },
    fixtures: {
      horizon: 3, gameweeks: [9, 10, 11], averageDifficulty: 3, adjustedDifficulty: 3, blanks: 0, doubles: 0, band: "Medium",
      fixtures: [{ gameweek: 9, opponent: "AVL", isHome: false, difficulty: 3, isBlank: false }] as never,
    },
    goalThreat: { band: "High", score: 1.1, baseXgiPer90: 1, opponent: "AVL", isHome: false, onPenalties: true, isEstimate: true },
    congestion: null,
    setPieces: { penalties: 1, corners: null, freekicks: null },
    ...overrides,
  };
}

const pick = (c: PlayerCard) => ({
  fplId: c.fplId, webName: c.webName, team: c.team, position: c.position,
  priceM: c.priceM, ownership: c.ownership, score: 1, reason: "r", card: c,
});

const thiago = card({ fplId: 7, webName: "Thiago", team: "BRE", priceM: 7.8, ownership: 8.8, form: { gameweeks: 4, points: 9, minutes: 360, starts: 4, xgiPer90: 0.5, score: 40 } });

const payload: ReportPayload = {
  version: 1, type: "preview", date: "2026-10-23", gameweek: 9, generatedAt: "2026-10-23T09:00:00Z",
  headline: "Gameweek 9 preview",
  summary: { captains: 1, differentials: 1, fixtureSwings: 1, congestion: 1 },
  sections: [
    { kind: "captains", id: "captains", title: "Captains", note: "Estimate.", items: [pick(card())] },
    { kind: "differentials", id: "differentials", title: "Differentials", note: "Estimate.", items: [pick(thiago)] },
    {
      kind: "fixture_swings", id: "fixture-swings", title: "Runs",
      items: [{ teamFplId: 1, team: "IPS", band: "Easy", adjustedDifficulty: 2.4, blanks: 0, doubles: 0,
        fixtures: [{ gameweek: 9, opponent: "NFO", isHome: true, difficulty: 2 }] }],
    },
    { kind: "congestion", id: "congestion", title: "CL", note: "CL only.",
      items: [{ team: "ARS", gameweek: 9, isAfterCl: false, isBeforeCl: true, daysSinceCl: null, daysUntilCl: 3.1 }] },
  ],
  xPost: "GW9 captain shortlist. #FPL",
};
const report: BuiltReport = { payload, messages: renderReport(payload) };
const facts = previewFacts(payload, "2026-10-24T10:00:00Z");

const good =
  "Haaland is the standout captain option for gameweek 9, with 9.5 expected points away at AVL and penalty duty. " +
  "Thiago is the differential to watch at just 8.8% owned, and Ipswich start an easy run at 2.4. " +
  "Arsenal face a Champions League game 3.1 days later.";

describe("preview facts", () => {
  it("carry the report's numbers at the rendered precision, in ranked order", () => {
    expect(facts.captainOptions[0]).toMatchObject({ name: "Haaland", expectedPoints: 9.5, venue: "away", onPenalties: true });
    expect(facts.differentials[0]).toMatchObject({ name: "Thiago", ownershipPercent: 8.8, pointsLast4Gameweeks: 9 });
    expect(facts.easiestFixtureRuns[0]).toMatchObject({ team: "IPS", difficulty: 2.4 });
    expect(facts.championsLeagueCongestion[0]).toMatchObject({ team: "ARS", daysBeforeChampionsLeague: 3.1 });
  });

  it("states the deadline in UK time", () => {
    expect(facts.deadline).toBe("Saturday 24 October, 11:00 UK time");
    expect(ukDeadlineLabel("2026-01-09T18:30:00Z")).toBe("Friday 9 January, 18:30 UK time");
  });

  it("never carry the experimental momentum fields", () => {
    expect(JSON.stringify(facts)).not.toMatch(/momentum|hourly/i);
  });

  it("are embedded in a prompt that forbids invented numbers", () => {
    const prompt = previewPrompt(facts);
    expect(prompt).toContain(JSON.stringify(facts));
    expect(prompt).toMatch(/Every number you write must appear in the facts/);
    expect(prompt).toMatch(/estimates/i);
  });
});

describe("prose validation", () => {
  it("accepts prose that only uses numbers from the facts", () => {
    expect(validateProse(good, facts)).toEqual({ ok: true, prose: good });
  });

  it("rejects an invented statistic", () => {
    const result = validateProse(good.replace("9.5 expected points", "9.5 expected points and 12 goals"), facts);
    expect(result).toEqual({ ok: false, reason: "numbers not in the facts: 12" });
  });

  it("rejects arithmetic the model did itself", () => {
    // 9.5 + 8.8 = 18.3 is not a fact, even though both inputs are
    expect(validateProse(`${good} Together that is 18.3.`, facts).ok).toBe(false);
  });

  it("reads thousands separators as one number", () => {
    const result = validateProse(`${good} Haaland was bought 125,000 times.`, facts);
    expect(result).toEqual({ ok: false, reason: "numbers not in the facts: 125000" });
  });

  it("accepts the same number at a different precision", () => {
    expect(validateProse(good.replace("at 2.4", "at 2.40"), facts).ok).toBe(true);
  });

  it("strips markdown and wrapping quotes instead of publishing them", () => {
    const result = validateProse(`"**${good}**"`, facts);
    expect(result).toEqual({ ok: true, prose: good });
  });

  it("rejects prose that is too short, too long, or carries a link", () => {
    expect(validateProse("Captain Haaland.", facts).ok).toBe(false);
    expect(validateProse(good.repeat(5), facts).ok).toBe(false);
    expect(validateProse(`${good} More at https://example.com`, facts).ok).toBe(false);
    expect(good.length).toBeLessThan(INSIGHT_CONFIG.ai.maxChars);
  });
});

describe("preview with prose", () => {
  it("puts the escaped prose under the headline with a code-written estimate label", () => {
    const withAi = withProse(report, `${good} <b>`);
    const first = withAi.messages[0] ?? "";

    expect(withAi.payload.prose).toBe(`${good} <b>`);
    expect(first.indexOf("Haaland is the standout")).toBeGreaterThan(first.indexOf("Gameweek 9 preview"));
    expect(first).toContain(AI_PROSE_LABEL);
    expect(first).toContain("&lt;b&gt;");
  });

  it("is delivered without the X draft in the channel text", () => {
    const delivery = previewDelivery(withProse(report, good));
    expect(delivery.kind).toBe("preview");
    expect(delivery.xDraft).toBe(payload.xPost);
    expect(delivery.messages.join("\n")).not.toContain("Draft for X");
  });

  it("leaves a template report without prose or label", () => {
    expect(report.payload.prose).toBeUndefined();
    expect(report.messages.join("\n")).not.toContain(AI_PROSE_LABEL);
  });
});
