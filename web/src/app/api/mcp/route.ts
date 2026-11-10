import { SITE, clampLimit, fixtureRuns, getPlayer, priceWatch, searchPlayers } from "@/lib/public-api";

/**
 * Armband's MCP server (ADR-0024): Model Context Protocol over Streamable
 * HTTP, stateless, answering plain JSON. Four read-only tools over the shared
 * cached data, so an agent can never cause an FPL call or touch anything
 * personal. Written by hand (a few JSON-RPC methods) rather than adding the
 * SDK as a dependency.
 */
export const runtime = "nodejs";

const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "search_players",
    description: "Search Fantasy Premier League players by name or club. Returns season points, form, price, ownership, goals, assists, xG, xA and xGI per 90, best season points first.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Player name or club short name, e.g. 'Saka' or 'ARS'. Empty lists everyone." },
        position: { type: "string", enum: ["GKP", "DEF", "MID", "FWD"] },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
    },
  },
  {
    name: "get_player",
    description: "One FPL player's season so far and next five fixtures with FPL difficulty (1 easy, 5 hard). Use an id from search_players.",
    inputSchema: { type: "object", properties: { id: { type: "integer", description: "FPL player id" } }, required: ["id"] },
  },
  {
    name: "price_watch",
    description: "Tonight's FPL price watch: players closest to a price rise or fall, from FPL's own price-change data. An estimate; past 100% is not a confirmed change.",
    inputSchema: {
      type: "object",
      properties: { direction: { type: "string", enum: ["rising", "falling"] }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
    },
  },
  {
    name: "fixture_runs",
    description: "Every Premier League club's next five gameweeks in FPL difficulty, easiest run first, with an adjusted difficulty score (an estimate).",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20, default: 20 } } },
  },
] as const;

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_players":
      return searchPlayers(String(args["query"] ?? ""), typeof args["position"] === "string" ? args["position"] : null, clampLimit(args["limit"]));
    case "get_player": {
      const id = Number(args["id"]);
      if (!Number.isInteger(id) || id <= 0) throw new Error("id must be a positive integer FPL player id");
      const p = await getPlayer(id);
      if (!p) throw new Error(`No player with id ${id}`);
      return p;
    }
    case "price_watch":
      return priceWatch(typeof args["direction"] === "string" ? args["direction"] : null, clampLimit(args["limit"]));
    case "fixture_runs":
      return fixtureRuns(clampLimit(args["limit"], 20, 20));
    default:
      return undefined;
  }
}

async function handle(msg: Rpc): Promise<object | null> {
  const { id, method, params = {} } = msg;
  if (!method) return fail(id, -32600, "Invalid request");
  // Notifications (no id) get no answer.
  if (id === undefined || method.startsWith("notifications/")) return null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "armband", title: "Armband FPL data", version: "1.0.0" },
        instructions: `Free, read-only Fantasy Premier League data from Armband (${SITE}). Forward-looking numbers are estimates.`,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params["name"] ?? "");
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;
      try {
        const data = await callTool(name, args);
        if (data === undefined) return fail(id, -32602, `Unknown tool: ${name}`);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (error) {
        return reply(id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed" }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Rpc[];
  const answers = (await Promise.all(messages.map(handle))).filter((a): a is object => a !== null);
  if (answers.length === 0) return new Response(null, { status: 202 });
  return Response.json(batch ? answers : answers[0], { headers: { "cache-control": "no-store" } });
}

/** This server streams nothing; per the spec a GET without an SSE stream answers 405. */
export function GET(): Response {
  return new Response("Use POST with JSON-RPC. See /openapi.json and /llms.txt.", { status: 405, headers: { allow: "POST" } });
}
