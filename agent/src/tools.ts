import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  applyPlan,
  bestLineup,
  checkTransfer,
  describePlan,
  expectedPoints,
  findPlayers,
  lineupPoints,
  lineupProblems,
  planOf,
  playerFacts,
  rateLineup,
  searchPlayers,
  squadPlayerFromCard,
  type AgentEvent,
  type LineupPlayer,
  type LineupPosition,
  type SiteCard,
  type Squad,
  type SquadPlayer,
  type TeamPlan,
  type TeamRun,
} from "@fpl/shared";
import { z } from "zod";
import { latestPreview, priceWatch, type PriceWatchRow } from "./data.ts";

/**
 * The agent's tools (docs/agent.md). Facts come from code; the logic
 * lives in packages/shared and is unit tested there. Each call reports itself
 * to the browser's live trace through `emit`, with a summary written by code.
 *
 * The ACTION tools (pick_best_xi, change_lineup, make_transfer) change a
 * DRAFT of the team — never FPL itself, which Armband only reads. Every
 * change is validated against FPL's rules by code, then sent to the pitch as
 * a plan the manager applies or reverts.
 */
export interface ToolContext {
  /** The manager's real FPL squad. */
  squad: Squad;
  cards: SiteCard[];
  /** Club `code` by FPL player id, for the kits of players bought in a plan. */
  teamCodes: ReadonlyMap<number, number>;
  runs: TeamRun[];
  /** The plan the manager already applied in Armband, if any: the draft starts from it. */
  plan: TeamPlan | null;
  emit: (event: AgentEvent) => void;
}

/** The draft the action tools work on: a plan, plus the players it buys. */
export interface Draft {
  plan: TeamPlan;
  incoming: Map<number, SquadPlayer>;
}

/** Start from the manager's applied plan when it still fits their squad; otherwise from FPL as-is. */
export function startDraft(squad: Squad, plan: TeamPlan | null, cards: ReadonlyMap<number, SiteCard>, teamCodes: ReadonlyMap<number, number>): Draft {
  if (plan) {
    const incoming = new Map<number, SquadPlayer>();
    for (const t of plan.transfers) {
      const card = cards.get(t.in);
      if (card) incoming.set(card.fplId, squadPlayerFromCard(card, teamCodes.get(card.fplId) ?? 0));
    }
    if (applyPlan(squad, plan, incoming)) return { plan, incoming };
  }
  return { plan: planOf(squad), incoming: new Map() };
}

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

/** The tool definitions, exported on their own so they can be tested without a model. */
export function buildTools(ctx: ToolContext, draft: Draft = startDraft(ctx.squad, ctx.plan, new Map(ctx.cards.map((c) => [c.fplId, c])), ctx.teamCodes)) {
  const cardsById = new Map(ctx.cards.map((c) => [c.fplId, c]));
  let seq = 0;

  /** The squad as the draft has it now. */
  const current = (): Squad => applyPlan(ctx.squad, draft.plan, draft.incoming) ?? ctx.squad;
  const owned = () => [...current().starters, ...current().bench];
  const ownedCards = () => owned().map((p) => cardsById.get(p.fplId)).filter((c): c is SiteCard => !!c);
  const pool = (): LineupPlayer[] =>
    owned().flatMap((p) => {
      const card = cardsById.get(p.fplId);
      return card ? [{ fplId: p.fplId, webName: p.webName, position: p.position as LineupPosition, card }] : [];
    });
  const lineupOf = (plan: TeamPlan) => ({ starters: plan.starters, bench: plan.bench, captain: plan.captain, vice: plan.vice });
  const ep = (id: number) => {
    const card = cardsById.get(id);
    return card ? Math.round(expectedPoints(card) * 10) / 10 : 0;
  };

  /** Commit a new plan to the draft and show it on the manager's pitch. */
  function commit(plan: TeamPlan): string[] {
    draft.plan = plan;
    const changes = describePlan(ctx.squad, plan, draft.incoming);
    const bought = new Set(plan.transfers.map((t) => t.in));
    ctx.emit({ type: "plan", plan, incoming: [...draft.incoming.values()].filter((p) => bought.has(p.fplId)), changes });
    return changes;
  }

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

  /** A tool call as the trace shows it: `name(key: value, …)`, readable rather than raw JSON. */
  const label = (name: string, args: Record<string, unknown>) =>
    `${name}(${Object.entries(args)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? `"${x}"` : JSON.stringify(x))).join(", ") : String(v)}`)
      .join(", ")})`;

  const readOnly = { annotations: { readOnlyHint: true, openWorldHint: false } };
  const position = z.enum(["GKP", "DEF", "MID", "FWD"]);

  const tools = [
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
      "Find players to bring in. To replace a squad player, pass `replacing` with their name: code then sets the position and the budget (bank + their price) and returns it — never add prices yourself. Otherwise filter by position and maximum price. Sorts by form (points last 4 GW), xgi90, fixtures (kindest next 5), ownership, expected_points or price. Excludes the squad and anyone without real minutes. Returns at most 10.",
      {
        replacing: z.string().min(2).optional().describe("Squad player to replace; sets position and budget"),
        position: position.optional(),
        maxPriceM: z.number().min(3.5).max(16).optional().describe("Maximum price in £m, e.g. 7.5"),
        team: z.string().length(3).optional().describe("Club short name, e.g. 'ARS'"),
        sortBy: z.enum(["form", "xgi90", "fixtures", "ownership", "expected_points", "price"]),
        limit: z.number().int().min(1).max(10).optional(),
      },
      async (args) =>
        traced("search_players", label("search_players", args), async () => {
          // The budget for a like-for-like swap is computed here, never by the model.
          let budget: { replacing: string; position: string; maxPriceM: number; bankM: number; sellingPriceM: number } | null = null;
          if (args.replacing) {
            const out = resolve(ownedCards(), args.replacing);
            if (typeof out === "string") return { data: out, summary: out, isError: true };
            const bankM = current().bankM;
            budget = {
              replacing: out.webName,
              position: out.position,
              bankM,
              sellingPriceM: out.priceM,
              maxPriceM: Math.round((bankM + out.priceM) * 10) / 10,
            };
          }
          const position = budget?.position ?? args.position;
          const maxPriceM = budget?.maxPriceM ?? args.maxPriceM;
          const hits = searchPlayers(ctx.cards, {
            sortBy: args.sortBy,
            limit: args.limit ?? 5,
            excludeIds: owned().map((p) => p.fplId),
            ...(position ? { position: position as "GKP" | "DEF" | "MID" | "FWD" } : {}),
            ...(maxPriceM !== undefined ? { maxPriceM } : {}),
            ...(args.team ? { team: args.team } : {}),
          });
          const top = hits.length ? `${hits.length} matches · top ${hits[0]!.name} £${hits[0]!.priceM.toFixed(1)}m` : "no matches";
          return {
            data: budget ? { budget: { ...budget, sellingPriceIsEstimate: true }, players: hits } : hits,
            summary: budget ? `budget £${budget.maxPriceM.toFixed(1)}m (est.) · ${top}` : top,
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
      "Check a transfer WITHOUT making it, for 'should I…' questions. Checks FPL's rules in code: positions match, at most 3 per club, bank stays non-negative. To actually make a transfer use make_transfer.",
      {
        out: z.array(z.string().min(2)).min(1).max(5).describe("Names of players to sell, from the manager's squad"),
        in: z.array(z.string().min(2)).min(1).max(5).describe("Names of players to buy"),
      },
      async (args) =>
        traced("check_transfer", `check_transfer(out: ${JSON.stringify(args.out)}, in: ${JSON.stringify(args.in)})`, async () => {
          const outs = args.out.map((n) => resolve(ownedCards(), n));
          const ins = args.in.map((n) => resolve(ctx.cards, n));
          const errors = [...outs, ...ins].filter((f): f is string => typeof f === "string");
          if (errors.length) return { data: errors.join(" "), summary: errors[0]!, isError: true };
          const result = checkTransfer(
            current(),
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
            const hit = findPlayers(ownedCards(), p.name)[0];
            return hit ? [{ id: hit.fplId, tone: p.tone, note: p.note }] : [];
          });
          if (lit.length) ctx.emit({ type: "highlight", players: lit });
          return { data: { highlighted: lit.length }, summary: `${lit.length} on the pitch` };
        }),
      { annotations: { readOnlyHint: true, openWorldHint: false } },
    ),
    tool(
      "pick_best_xi",
      "MAKE the strongest legal starting XI from the manager's 15 for next gameweek, with captain, vice-captain and bench order, and put it on their pitch. Chosen by code from FPL's expected points (an estimate). Use for 'pick my team / best XI / set my lineup'.",
      {},
      async () =>
        traced("pick_best_xi", "pick_best_xi()", async () => {
          const players = pool();
          const before = lineupPoints(lineupOf(draft.plan), players);
          const best = bestLineup(players);
          const changes = commit({ ...draft.plan, ...best });
          const after = lineupPoints(best, players);
          const name = (id: number) => players.find((p) => p.fplId === id)!.webName;
          const count = (pos: string) => best.starters.filter((id) => players.find((p) => p.fplId === id)!.position === pos).length;
          return {
            data: {
              estimate: true,
              formation: `${count("DEF")}-${count("MID")}-${count("FWD")}`,
              captain: `${name(best.captain)} (${ep(best.captain)} expected points)`,
              vice: name(best.vice),
              starters: best.starters.map((id) => `${name(id)} ${ep(id)}`),
              bench: best.bench.map(name),
              expectedPointsBefore: before,
              expectedPointsAfter: after,
              changes,
            },
            summary: `${count("DEF")}-${count("MID")}-${count("FWD")} · C ${name(best.captain)} · ${before} → ${after} exp. pts (est.)`,
          };
        }),
    ),

    tool(
      "change_lineup",
      "MAKE specific lineup changes on the manager's pitch: start bench players in place of starters (pairs, in order), and/or set captain and vice-captain. Validated against FPL's formation rules by code. Use for 'bench X', 'start Y', 'captain Z'.",
      {
        start: z.array(z.string().min(2)).max(4).optional().describe("Bench players to bring into the XI"),
        bench: z.array(z.string().min(2)).max(4).optional().describe("Starters to drop to the bench, paired with `start` in order"),
        captain: z.string().min(2).optional(),
        vice_captain: z.string().min(2).optional(),
      },
      async (args) =>
        traced("change_lineup", label("change_lineup", args), async () => {
          const players = pool();
          const find = (name: string) => {
            const hit = resolve(players.map((p) => cardsById.get(p.fplId)!), name);
            return typeof hit === "string" ? hit : hit.fplId;
          };
          const plan: TeamPlan = { ...draft.plan, starters: [...draft.plan.starters], bench: [...draft.plan.bench] };
          const ins = (args.start ?? []).map(find);
          const outs = (args.bench ?? []).map(find);
          const errors = [...ins, ...outs].filter((x): x is string => typeof x === "string");
          if (errors.length) return { data: errors.join(" "), summary: errors[0]!, isError: true };
          if (ins.length !== outs.length) return { data: "Name as many players to start as to bench.", summary: "start and bench counts differ", isError: true };
          for (let i = 0; i < ins.length; i++) {
            const inId = ins[i] as number;
            const outId = outs[i] as number;
            const s = plan.starters.indexOf(outId);
            const b = plan.bench.indexOf(inId);
            if (s < 0) return { data: `${players.find((p) => p.fplId === outId)!.webName} is not starting.`, summary: "not a starter", isError: true };
            if (b < 0) return { data: `${players.find((p) => p.fplId === inId)!.webName} is not on the bench.`, summary: "not on the bench", isError: true };
            plan.starters[s] = inId;
            plan.bench[b] = outId;
            if (plan.captain === outId) plan.captain = inId;
            if (plan.vice === outId) plan.vice = inId;
          }
          for (const [key, name] of [["captain", args.captain], ["vice", args.vice_captain]] as const) {
            if (!name) continue;
            const id = find(name);
            if (typeof id === "string") return { data: id, summary: id, isError: true };
            if (key === "captain" && plan.vice === id) plan.vice = plan.captain;
            if (key === "vice" && plan.captain === id) plan.captain = plan.vice;
            plan[key] = id;
          }
          const problems = lineupProblems(lineupOf(plan), players);
          if (problems.length) return { data: { valid: false, problems }, summary: `not allowed · ${problems[0]}`, isError: true };
          const changes = commit(plan);
          return {
            data: { valid: true, changes, expectedPoints: lineupPoints(lineupOf(plan), players), estimate: true },
            summary: changes.length ? changes.join(" · ") : "no change",
          };
        }),
    ),

    tool(
      "make_transfer",
      "MAKE a transfer on the manager's pitch: sell one squad player and buy one, validated by code (positions, 3 per club, bank). The new player takes the sold player's place. FPL charges 4 points for each transfer beyond the manager's free ones; mention it. Call search_players first to choose who to buy.",
      {
        out: z.string().min(2).describe("Squad player to sell"),
        in: z.string().min(2).describe("Player to buy"),
      },
      async (args) =>
        traced("make_transfer", `make_transfer(out: "${args.out}", in: "${args.in}")`, async () => {
          const out = resolve(ownedCards(), args.out);
          const inn = resolve(ctx.cards, args.in);
          if (typeof out === "string" || typeof inn === "string") {
            const msg = [out, inn].filter((x) => typeof x === "string").join(" ");
            return { data: msg, summary: msg, isError: true };
          }
          const check = checkTransfer(current(), cardsById, [out.fplId], [inn.fplId]);
          if (!check.valid) return { data: check, summary: `not allowed · ${check.problems[0]}`, isError: true };

          const plan: TeamPlan = { ...draft.plan, transfers: [...draft.plan.transfers] };
          // Selling someone bought earlier in this plan replaces that purchase.
          const earlier = plan.transfers.findIndex((t) => t.in === out.fplId);
          if (earlier >= 0) {
            plan.transfers[earlier] = { out: plan.transfers[earlier]!.out, in: inn.fplId };
            draft.incoming.delete(out.fplId);
          } else {
            if (plan.transfers.length >= 5) return { data: "At most 5 transfers in one plan.", summary: "too many transfers", isError: true };
            plan.transfers.push({ out: out.fplId, in: inn.fplId });
          }
          draft.incoming.set(inn.fplId, squadPlayerFromCard(inn, ctx.teamCodes.get(inn.fplId) ?? 0));
          const swap = (id: number) => (id === out.fplId ? inn.fplId : id);
          plan.starters = plan.starters.map(swap);
          plan.bench = plan.bench.map(swap);
          plan.captain = swap(plan.captain);
          plan.vice = swap(plan.vice);
          const changes = commit(plan);
          return {
            data: { valid: true, bankAfterM: check.bankAfterM, sellingPriceIsEstimate: true, changes, newPlayer: playerFacts(inn) },
            summary: `${out.webName} → ${inn.webName} · bank £${check.bankAfterM.toFixed(1)}m (est.)`,
          };
        }),
    ),

    tool(
      "rate_lineup",
      "Rate the manager's current lineup out of 10, computed by code: its expected points against the best XI their own 15 can field (captain counted twice), with the concrete issues. An estimate.",
      {},
      async () =>
        traced("rate_lineup", "rate_lineup()", async () => {
          const players = pool();
          const r = rateLineup(lineupOf(draft.plan), players);
          const name = (id: number) => players.find((p) => p.fplId === id)!.webName;
          return {
            data: {
              estimate: true,
              rating: r.rating,
              outOf: 10,
              expectedPoints: r.expectedPoints,
              bestPossibleExpectedPoints: r.bestExpectedPoints,
              issues: r.issues,
              bestCaptain: name(r.best.captain),
            },
            summary: `${r.rating}/10 · ${r.expectedPoints} of ${r.bestExpectedPoints} exp. pts (est.)`,
          };
        }),
      readOnly,
    ),
  ];

  return tools;
}

/** In-process MCP server "fpl": the tools appear to the agent as mcp__fpl__<name>. */
export function buildToolServer(ctx: ToolContext, draft: Draft) {
  return createSdkMcpServer({ name: "fpl", version: "1.0.0", tools: buildTools(ctx, draft), alwaysLoad: true });
}
