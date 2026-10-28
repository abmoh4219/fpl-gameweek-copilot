import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  checkTransfer,
  findPlayers,
  playerFacts,
  searchPlayers,
  squadFacts,
  type AgentEvent,
  type SiteCard,
  type Squad,
  type TeamRun,
} from "@fpl/shared";
import { z } from "zod";
import { latestPreview, priceWatch, type PriceWatchRow } from "./data.ts";

/**
 * The agent's tools (docs/agent-plan.md §5). Every one is READ-ONLY and
 * returns facts computed by code; the logic lives in packages/shared and is
 * unit tested there. Each call reports itself to the browser's live trace
 * through `emit`, with a one-line summary written by code, not the model.
 */
export interface ToolContext {
  squad: Squad;
  cards: SiteCard[];
  runs: TeamRun[];
  emit: (event: AgentEvent) => void;
}

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

/** The tool definitions, exported on their own so they can be tested without a model. */
export function buildTools(ctx: ToolContext) {
  const cardsById = new Map(ctx.cards.map((c) => [c.fplId, c]));
  const owned = [...ctx.squad.starters, ...ctx.squad.bench];
  const ownedCards = owned.map((p) => cardsById.get(p.fplId)).filter((c): c is SiteCard => !!c);
  let seq = 0;

  /** Wraps a handler so every call shows in the trace, success or failure. */
  async function traced(
    name: string,
    label: string,
    run: () => Promise<{ data: unknown; summary: string; isError?: boolean }>,
  ): Promise<Result> {
    const id = `t${++seq}`;
    ctx.emit({ type: "tool_call", id, name, label });
    try {
      const { data, summary, isError = false } = await run();
      ctx.emit({ type: "tool_result", id, summary, isError });
      return { content: [{ type: "text", text: JSON.stringify(data) }], ...(isError ? { isError } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "tool failed";
      ctx.emit({ type: "tool_result", id, summary: message, isError: true });
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }

  /** Resolve a name; ambiguous or unknown names come back as an error the model can act on. */
  function resolve(pool: readonly SiteCard[], name: string): SiteCard | string {
    const hits = findPlayers(pool, name);
    if (hits.length === 0) return `No player matching "${name}".`;
    if (hits.length > 1 && hits[0]!.webName.toLowerCase() !== name.toLowerCase()) {
      return `"${name}" is ambiguous: ${hits.map((h) => `${h.webName} (${h.team}, id ${h.fplId})`).join(", ")}. Use the exact name.`;
    }
    return hits[0]!;
  }

  const readOnly = { annotations: { readOnlyHint: true, openWorldHint: false } };
  const position = z.enum(["GKP", "DEF", "MID", "FWD"]);

  const tools = [
    tool(
      "get_my_squad",
      "The manager's current 15: starters, bench, captain, vice, statuses, gameweek points, bank and squad value. Call this first for any question about 'my team'.",
      {},
      async () =>
        traced("get_my_squad", "get_my_squad()", async () => {
          const facts = squadFacts(ctx.squad);
          const captain = owned.find((p) => p.isCaptain)?.webName ?? "—";
          const flagged = owned.filter((p) => p.status !== "a").length;
          return {
            data: facts,
            summary: `${owned.length} players · bank £${ctx.squad.bankM.toFixed(1)}m · C ${captain}${flagged ? ` · ${flagged} flagged` : ""}`,
          };
        }),
      readOnly,
    ),

    tool(
      "get_player",
      "Full computed card for one player by name: price, ownership, status and news, last-4-gameweek points and minutes, xGI per 90, minutes risk, goal threat (estimate), next 5 fixtures with FPL difficulty 1-5.",
      { name: z.string().min(2).describe("Player name as shown in FPL, e.g. 'Saka' or 'B.Fernandes'") },
      async ({ name }) =>
        traced("get_player", `get_player("${name}")`, async () => {
          const hit = resolve(ctx.cards, name);
          if (typeof hit === "string") return { data: hit, summary: hit, isError: true };
          const f = playerFacts(hit);
          return {
            data: f,
            summary: `${f.name} · ${f.status} · ${f.xgiPer90} xGI/90 · minutes risk ${f.minutesRisk} · £${f.priceM.toFixed(1)}m`,
          };
        }),
      readOnly,
    ),

    tool(
      "search_players",
      "Find players to bring in. Filters by position, maximum price and club; sorts by form (points last 4 GW), xgi90, fixtures (kindest next 5), ownership, expected_points or price. Excludes players already in the squad and anyone without real minutes. Returns at most 10.",
      {
        position: position.optional(),
        maxPriceM: z.number().min(3.5).max(16).optional().describe("Maximum price in £m, e.g. 7.5"),
        team: z.string().length(3).optional().describe("Club short name, e.g. 'ARS'"),
        sortBy: z.enum(["form", "xgi90", "fixtures", "ownership", "expected_points", "price"]),
        limit: z.number().int().min(1).max(10).optional(),
      },
      async (args) =>
        traced("search_players", `search_players(${JSON.stringify(args)})`, async () => {
          const hits = searchPlayers(ctx.cards, {
            sortBy: args.sortBy,
            limit: args.limit ?? 5,
            excludeIds: owned.map((p) => p.fplId),
            ...(args.position ? { position: args.position } : {}),
            ...(args.maxPriceM !== undefined ? { maxPriceM: args.maxPriceM } : {}),
            ...(args.team ? { team: args.team } : {}),
          });
          return {
            data: hits,
            summary: hits.length ? `${hits.length} matches · top ${hits[0]!.name} £${hits[0]!.priceM.toFixed(1)}m` : "no matches",
          };
        }),
      readOnly,
    ),

    tool(
      "compare_players",
      "Side-by-side computed cards for 2 to 4 players by name.",
      { names: z.array(z.string().min(2)).min(2).max(4) },
      async ({ names }) =>
        traced("compare_players", `compare_players(${JSON.stringify(names)})`, async () => {
          const found = names.map((n) => resolve(ctx.cards, n));
          const errors = found.filter((f): f is string => typeof f === "string");
          if (errors.length) return { data: errors.join(" "), summary: errors[0]!, isError: true };
          const facts = (found as SiteCard[]).map(playerFacts);
          return { data: facts, summary: facts.map((f) => `${f.name} ${f.pointsLast4}pts`).join(" vs ") };
        }),
      readOnly,
    ),

    tool(
      "get_fixture_runs",
      "Fixture runs by club, adjusted for opponent strength. Lower adjustedDifficulty = kinder. With no clubs given, returns the 5 easiest and 5 hardest runs.",
      {
        teams: z.array(z.string().length(3)).max(20).optional().describe("Club short names, e.g. ['MCI','ARS']"),
        horizon: z.union([z.literal(3), z.literal(5)]).optional().describe("Gameweeks ahead: 3 or 5 (default 5)"),
      },
      async ({ teams, horizon = 5 }) =>
        traced("get_fixture_runs", `get_fixture_runs(${teams ? JSON.stringify(teams) : ""}${teams ? ", " : ""}${horizon})`, async () => {
          const pick = (r: TeamRun) => (horizon === 3 ? r.short : r.long);
          const view = (r: TeamRun) => ({
            team: r.team,
            band: pick(r).band,
            adjustedDifficulty: Math.round(pick(r).adjustedDifficulty * 100) / 100,
            fixtures: pick(r)
              .fixtures.map((f) => (f.isBlank || !f.opponent ? `GW${f.gameweek} blank` : `${f.opponent}(${f.isHome ? "H" : "A"}) ${f.difficulty}`))
              .join(" · "),
          });
          const wanted = teams?.map((t) => t.toUpperCase());
          const sorted = [...ctx.runs].sort((a, b) => pick(a).adjustedDifficulty - pick(b).adjustedDifficulty);
          const data = wanted
            ? sorted.filter((r) => wanted.includes(r.team)).map(view)
            : { easiest: sorted.slice(0, 5).map(view), hardest: sorted.slice(-5).reverse().map(view) };
          const list = Array.isArray(data) ? data : data.easiest;
          return { data, summary: list.map((r) => `${r.team} ${r.band}`).slice(0, 4).join(" · ") || "no clubs matched" };
        }),
      readOnly,
    ),

    tool(
      "check_transfer",
      "ALWAYS call before recommending a transfer. Checks FPL's rules in code: same number out and in, positions match, at most 3 per club, bank stays non-negative. Returns valid, problems and bank after (selling price is an estimate).",
      {
        out: z.array(z.string().min(2)).min(1).max(5).describe("Names of players to sell, from the manager's squad"),
        in: z.array(z.string().min(2)).min(1).max(5).describe("Names of players to buy"),
      },
      async (args) =>
        traced("check_transfer", `check_transfer(out: ${JSON.stringify(args.out)}, in: ${JSON.stringify(args.in)})`, async () => {
          const outs = args.out.map((n) => resolve(ownedCards, n));
          const ins = args.in.map((n) => resolve(ctx.cards, n));
          const errors = [...outs, ...ins].filter((f): f is string => typeof f === "string");
          if (errors.length) return { data: errors.join(" "), summary: errors[0]!, isError: true };
          const result = checkTransfer(
            ctx.squad,
            cardsById,
            (outs as SiteCard[]).map((c) => c.fplId),
            (ins as SiteCard[]).map((c) => c.fplId),
          );
          return {
            data: result,
            summary: result.valid
              ? `valid · bank after £${result.bankAfterM.toFixed(1)}m (est.)`
              : `invalid · ${result.problems[0]}`,
          };
        }),
      readOnly,
    ),

    tool(
      "get_price_watch",
      "ESTIMATES of who is close to a price rise or fall, from FPL's own price-change data. Optionally filter by names. Never present these as confirmed changes.",
      { names: z.array(z.string().min(2)).max(15).optional() },
      async ({ names }) =>
        traced("get_price_watch", `get_price_watch(${names ? JSON.stringify(names) : ""})`, async () => {
          const rows = await priceWatch();
          const shape = (r: PriceWatchRow) => ({
            name: r.web_name,
            team: r.team_short_name,
            priceM: r.price_m,
            towardChangePct: r.price_change_percent,
            direction: r.direction,
            locked: r.is_locked,
          });
          let picked: PriceWatchRow[];
          if (names?.length) {
            const wanted = new Set(names.flatMap((n) => findPlayers(ctx.cards, n).slice(0, 1).map((c) => c.fplId)));
            picked = rows.filter((r) => wanted.has(r.fpl_id));
          } else {
            picked = [...rows]
              .filter((r) => r.price_change_percent !== null)
              .sort((a, b) => Math.abs(b.price_change_percent!) - Math.abs(a.price_change_percent!))
              .slice(0, 10);
          }
          return {
            data: { estimate: true, note: "Estimates from FPL's price-change data, not confirmed changes.", players: picked.map(shape) },
            summary: `${picked.length} players · estimates`,
          };
        }),
      readOnly,
    ),

    tool(
      "get_preview",
      "The latest pre-deadline gameweek preview computed by the pipeline: ranked captain options and differentials (estimates).",
      {},
      async () =>
        traced("get_preview", "get_preview()", async () => {
          const preview = await latestPreview();
          if (!preview) return { data: "No preview stored yet.", summary: "no preview yet", isError: true };
          const payload = preview.payload as { sections?: { kind: string; items: { webName: string; team: string; priceM: number; reason: string; ownership?: number }[] }[] };
          const pickSection = (kind: string) =>
            payload.sections?.find((s) => s.kind === kind)?.items.map((i) => ({ name: i.webName, team: i.team, priceM: i.priceM, why: i.reason })) ?? [];
          const data = { gameweek: preview.gameweek, estimate: true, captains: pickSection("captains"), differentials: pickSection("differentials") };
          return { data, summary: `GW${preview.gameweek} · ${data.captains.length} captains · ${data.differentials.length} differentials` };
        }),
      readOnly,
    ),

    tool(
      "highlight_players",
      "Light up players from the manager's squad on their pitch while you answer: 'sell' (red), 'keep' or 'buy' (green), 'watch' (amber). Use it whenever you recommend selling, keeping or watching specific squad players. Players not in the squad are ignored.",
      {
        players: z
          .array(
            z.object({
              name: z.string().min(2),
              tone: z.enum(["sell", "keep", "buy", "watch"]),
              note: z.string().max(14).describe("2-3 word label shown under the shirt, e.g. 'injured', 'captain'"),
            }),
          )
          .min(1)
          .max(6),
      },
      async ({ players }) =>
        traced("highlight_players", `highlight_players(${players.map((p) => `${p.name}:${p.tone}`).join(", ")})`, async () => {
          const lit = players.flatMap((p) => {
            const hit = findPlayers(ownedCards, p.name)[0];
            return hit ? [{ id: hit.fplId, tone: p.tone, note: p.note }] : [];
          });
          if (lit.length) ctx.emit({ type: "highlight", players: lit });
          return { data: { highlighted: lit.length }, summary: `${lit.length} on the pitch` };
        }),
      { annotations: { readOnlyHint: true, openWorldHint: false } },
    ),
  ];

  return tools;
}

/** In-process MCP server "fpl": the tools appear to the agent as mcp__fpl__<name>. */
export function buildToolServer(ctx: ToolContext) {
  return createSdkMcpServer({ name: "fpl", version: "1.0.0", tools: buildTools(ctx), alwaysLoad: true });
}
