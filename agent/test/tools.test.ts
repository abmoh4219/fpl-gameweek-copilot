import { describe, expect, it, vi } from "vitest";
import { buildSquad, planOf, type AgentEvent, type SiteCard, type Squad, type TeamPlan, type TeamRun } from "@fpl/shared";
import { all, cardRows, entry, picks } from "../../packages/shared/test/fixtures.ts";

// The tools read two views over the network; give them fixed answers instead.
vi.mock("../src/data.ts", () => ({
  priceWatch: async () => [
    { fpl_id: 2, web_name: "Mbeumo", team_short_name: "MUN", price_m: 7.9, price_change_percent: 84.2, direction: "rise", is_locked: false },
    { fpl_id: 1, web_name: "Haaland", team_short_name: "MCI", price_m: 15.7, price_change_percent: -12, direction: "fall", is_locked: false },
  ],
  latestPreview: async () => ({
    gameweek: 9,
    payload: { sections: [{ kind: "captains", items: [{ webName: "Haaland", team: "MCI", priceM: 15.7, reason: "ep 6.3" }] }] },
  }),
}));

const { buildTools, startDraft } = await import("../src/tools.ts");

const fx = { gameweek: 9, opponent: "AVL", isHome: false, difficulty: 3, isBlank: false, isDouble: false };
const run = { horizon: 5, gameweeks: [9], averageDifficulty: 3, adjustedDifficulty: 3, blanks: 0, doubles: 0, band: "Medium" as const, fixtures: [fx] };
const card = (fplId: number, webName: string, team: string, position: string, priceM: number): SiteCard =>
  ({
    version: 1, playerId: fplId, fplId, webName, team, position, priceM, priceChangeEventTenths: 0, ownership: 10,
    netTransfersEvent: 0, totalPoints: 40, epNext: 5, status: "a", news: "", chanceOfPlayingNextRound: null,
    minutes: 700, starts: 8, xgiPer90: 0.5,
    form: { gameweeks: 4, points: 20, minutes: 360, starts: 4, xgiPer90: 0.5, score: 70 },
    minutesRisk: { band: "Low", score: 0, reasons: [] }, fixtures: { ...run, horizon: 3 },
    goalThreat: { band: "High", score: 1, baseXgiPer90: 0.5, opponent: "AVL", isHome: false, onPenalties: true, isEstimate: true },
    congestion: null, setPieces: { penalties: 1, corners: null, freekicks: null }, fixturesLong: run,
  }) as SiteCard;

const haaland = card(1, "Haaland", "MCI", "FWD", 15.7);
const mbeumo = card(2, "Mbeumo", "MUN", "MID", 7.9);
const cherki = card(3, "Cherki", "MCI", "MID", 8.0);
const player = (c: SiteCard, slot: number, captain = false) => ({
  fplId: c.fplId, webName: c.webName, team: c.team, teamCode: 43, position: c.position as "FWD", slot, isStarter: true,
  isCaptain: captain, isViceCaptain: false, multiplier: captain ? 2 : 1, priceM: c.priceM, ownership: 10, status: "a", news: "",
  chanceOfPlayingNextRound: null, eventPoints: 8, pickPoints: captain ? 16 : 8, seasonPoints: 60, formPoints: 20, xgiPer90: 0.5,
  minutesRisk: "Low", goalThreat: "High", fixtureBand: "Medium", fixtures: [fx],
  kit: { primary: "#000", secondary: "#fff", pattern: "solid" as const, ink: "#fff" },
});
const squad: Squad = {
  entryId: 1, teamName: "Test XI", managerName: "Tester", gameweek: 8, gameweekPoints: 48, totalPoints: 548, overallRank: 1,
  bankM: 0.7, valueM: 101.6, activeChip: null, starters: [player(haaland, 11, true), player(cherki, 8)], bench: [], missing: [],
};
const runs: TeamRun[] = [
  { version: 1, teamFplId: 13, team: "MCI", short: { ...run, horizon: 3 }, long: run },
  { version: 1, teamFplId: 14, team: "MUN", short: { ...run, horizon: 3, adjustedDifficulty: 2 }, long: { ...run, adjustedDifficulty: 2, band: "Easy" as const } },
];

function setup() {
  const events: AgentEvent[] = [];
  const tools = buildTools({ squad, cards: [haaland, mbeumo, cherki], teamCodes: new Map(), runs, plan: null, emit: (e) => events.push(e) });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const t = tools.find((x) => x.name === name)!;
    const result = await t.handler(args as never, {});
    const text = (result.content[0] as { text: string }).text;
    return { result, text, data: (() => { try { return JSON.parse(text); } catch { return text; } })() };
  };
  return { events, call, tools };
}

describe("agent tools", () => {
  it("exposes the read tools and the four coach tools, and no squad lookup (it travels with the question)", () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "change_lineup", "check_transfer", "compare_players", "get_fixture_runs", "get_player",
      "get_preview", "get_price_watch", "highlight_players", "make_transfer", "pick_best_xi",
      "rate_lineup", "search_players",
    ]);
  });

  it("traces every call with a code-written summary", async () => {
    const { events, call } = setup();
    await call("get_player", { name: "Haaland" });
    expect(events[0]).toMatchObject({ type: "tool_call", name: "get_player", label: 'get_player("Haaland")' });
    expect(events[1]).toMatchObject({ type: "tool_result", isError: false });
    expect((events[1] as { summary: string }).summary).toMatch(/Haaland · available · 0\.5 xGI\/90/);
  });

  it("returns a player's computed card", async () => {
    const { data } = await setup().call("get_player", { name: "haaland" });
    expect(data).toMatchObject({ name: "Haaland", xgiPer90: 0.5, minutesRisk: "Low" });
  });

  it("reports an unknown player as a tool error the model can act on", async () => {
    const { result, events } = await (async () => {
      const s = setup();
      const r = await s.call("get_player", { name: "Nobody Atall" });
      return { result: r.result, events: s.events };
    })();
    expect(result.isError).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "tool_result", isError: true });
  });

  it("searches outside the squad only", async () => {
    const { data } = await setup().call("search_players", { position: "MID", sortBy: "form" });
    expect(data.map((p: { name: string }) => p.name)).toEqual(["Mbeumo"]);
  });

  it("checks a transfer with the rules in code", async () => {
    const { data } = await setup().call("check_transfer", { out: ["Cherki"], in: ["Mbeumo"] });
    expect(data).toMatchObject({ valid: true, bankAfterM: 0.8 });
  });

  it("refuses to sell someone outside the squad", async () => {
    const { result } = await setup().call("check_transfer", { out: ["Mbeumo"], in: ["Cherki"] });
    expect(result.isError).toBe(true);
  });

  it("serves fixture runs, kindest first", async () => {
    const { data } = await setup().call("get_fixture_runs", {});
    expect(data.easiest[0].team).toBe("MUN");
  });

  it("labels the price watch as estimates and never leaks momentum", async () => {
    const { data, text } = await setup().call("get_price_watch", {});
    expect(data.estimate).toBe(true);
    expect(text).not.toMatch(/momentum|hourly/i);
  });

  it("lights up squad players only", async () => {
    const { events, call } = setup();
    await call("highlight_players", { players: [{ name: "Cherki", tone: "sell", note: "out" }, { name: "Mbeumo", tone: "buy", note: "in" }] });
    expect(events.find((e) => e.type === "highlight")).toEqual({ type: "highlight", players: [{ id: 3, tone: "sell", note: "out" }] });
  });
});

/**
 * The coach tools act on a DRAFT of a full, legal 15 (the shared fixture):
 * every change is validated by code and sent to the pitch as a plan.
 */
describe("coach tools", () => {
  const full = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });
  const cardsById = new Map(all.map((c) => [c.fplId, c]));
  const teamCodes = new Map(all.map((c) => [c.fplId, 7]));

  function coach(plan: TeamPlan | null = null) {
    const events: AgentEvent[] = [];
    const ctx = { squad: full, cards: all, teamCodes, runs, plan, emit: (e: AgentEvent) => events.push(e) };
    const draft = startDraft(full, plan, cardsById, teamCodes);
    const tools = buildTools(ctx, draft);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools.find((x) => x.name === name)!.handler(args as never, {});
      const text = (result.content[0] as { text: string }).text;
      return { result, data: (() => { try { return JSON.parse(text); } catch { return text; } })() };
    };
    const plans = () => events.filter((e): e is Extract<AgentEvent, { type: "plan" }> => e.type === "plan");
    return { call, plans, draft };
  }

  it("pick_best_xi puts a legal XI on the pitch and benches the injured player", async () => {
    const { call, plans } = coach();
    const { data } = await call("pick_best_xi");
    expect(data.estimate).toBe(true);
    const plan = plans().at(-1)!.plan;
    expect(plan.starters).toHaveLength(11);
    expect(plan.starters).not.toContain(8); // Cherki is injured in the fixture
    expect(data.expectedPointsAfter).toBeGreaterThanOrEqual(data.expectedPointsBefore);
  });

  it("change_lineup swaps a starter for a bench player and sets the captain, with plain-word changes", async () => {
    const { call, plans } = coach();
    const { result } = await call("change_lineup", { start: ["O'Reilly"], bench: ["Kayode"], captain: "Rogers" });
    expect(result.isError).toBeFalsy();
    // Kayode was vice-captain: the armband passes to the player who takes his place.
    expect(plans().at(-1)!.changes).toEqual([
      "Start: O'Reilly",
      "Bench: Kayode",
      "Captain: Haaland → Rogers",
      "Vice-captain: Kayode → O'Reilly",
    ]);
  });

  it("change_lineup refuses an illegal formation and changes nothing", async () => {
    const { call, plans } = coach();
    // Starting the reserve keeper for a defender would put two keepers in the XI.
    const { result, data } = await call("change_lineup", { start: ["Kinsky"], bench: ["Kayode"] });
    expect(result.isError).toBe(true);
    expect(data.problems.join(" ")).toMatch(/goalkeeper/);
    expect(plans()).toHaveLength(0);
  });

  it("make_transfer validates in code, swaps the player in place and sends the new kit", async () => {
    const { call, plans } = coach();
    const { result, data } = await call("make_transfer", { out: "Rogers", in: "Mbeumo" });
    expect(result.isError).toBeFalsy();
    expect(data.valid).toBe(true);
    expect(data.bankAfterM).toBeCloseTo(0.8, 1);
    const last = plans().at(-1)!;
    expect(last.plan.transfers).toEqual([{ out: 7, in: 100 }]);
    expect(last.plan.starters).toContain(100);
    expect(last.incoming.map((p) => p.webName)).toEqual(["Mbeumo"]);
  });

  it("make_transfer refuses a move the bank cannot afford", async () => {
    const { call, plans } = coach();
    // £0.7m in the bank + £5.0m for Belloumi cannot buy a £7.9m player.
    const { result } = await call("make_transfer", { out: "Belloumi", in: "Mbeumo" });
    expect(result.isError).toBe(true);
    expect(plans()).toHaveLength(0);
  });

  it("make_transfer refuses a fourth player from one club", async () => {
    const { call, plans } = coach();
    // MCI already has Cherki, Haaland and O'Reilly.
    // Rogers (£8.0m) for Foden (£8.0m) is affordable, so only the club rule can refuse it.
    const { result, data } = await call("make_transfer", { out: "Rogers", in: "Foden" });
    expect(result.isError).toBe(true);
    expect(data.problems.join(" ")).toMatch(/MCI/);
    expect(plans()).toHaveLength(0);
  });

  it("rate_lineup scores out of 10 with code-written issues, and changes nothing", async () => {
    const { call, plans } = coach();
    const { data } = await call("rate_lineup");
    expect(data.outOf).toBe(10);
    expect(data.rating).toBeGreaterThanOrEqual(0);
    expect(data.rating).toBeLessThanOrEqual(10);
    expect(data.issues.join(" ")).toMatch(/Cherki is starting but is not expected to play/);
    expect(plans()).toHaveLength(0);
  });

  it("continues from the manager's applied plan", async () => {
    const applied = { ...planOf(full), captain: 7 };
    const { draft } = coach(applied);
    expect(draft.plan.captain).toBe(7);
  });
});
