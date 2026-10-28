import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, SiteCard, Squad, TeamRun } from "@fpl/shared";

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

const { buildTools } = await import("../src/tools.ts");

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
  chanceOfPlayingNextRound: null, eventPoints: 8, pickPoints: captain ? 16 : 8, formPoints: 20, xgiPer90: 0.5,
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
  const tools = buildTools({ squad, cards: [haaland, mbeumo, cherki], runs, emit: (e) => events.push(e) });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const t = tools.find((x) => x.name === name)!;
    const result = await t.handler(args as never, {});
    const text = (result.content[0] as { text: string }).text;
    return { result, text, data: (() => { try { return JSON.parse(text); } catch { return text; } })() };
  };
  return { events, call, tools };
}

describe("agent tools", () => {
  it("exposes exactly the nine read-only tools", () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_transfer", "compare_players", "get_fixture_runs", "get_my_squad", "get_player",
      "get_preview", "get_price_watch", "highlight_players", "search_players",
    ]);
  });

  it("traces every call with a code-written summary", async () => {
    const { events, call } = setup();
    await call("get_my_squad");
    expect(events[0]).toMatchObject({ type: "tool_call", name: "get_my_squad", label: "get_my_squad()" });
    expect(events[1]).toMatchObject({ type: "tool_result", isError: false });
    expect((events[1] as { summary: string }).summary).toMatch(/bank £0\.7m · C Haaland/);
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
