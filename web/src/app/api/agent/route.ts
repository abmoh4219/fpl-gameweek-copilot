import { createHash } from "node:crypto";
import { AgentRequestSchema, type AgentEvent } from "@fpl/shared";
import { loadSquad } from "@/lib/squad";

/**
 * The browser's only door to the agent (docs/agent-plan.md §3).
 *
 * The agent service runs in a container elsewhere; this route validates the
 * question, attaches the manager's squad (from cache), hashes the visitor's
 * IP for the per-visitor limit, and streams the agent's events straight
 * back. The agent's URL and its shared secret never reach the browser.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const AGENT_URL = process.env["AGENT_URL"];
const AGENT_SECRET = process.env["AGENT_SHARED_SECRET"];

function line(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function failure(code: Extract<AgentEvent, { type: "error" }>["code"], message: string, status = 200): Response {
  return new Response(line({ type: "error", code, message }), {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

/** A salted hash: the per-visitor limit needs to recognise an IP, never store one. */
function hashIp(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${AGENT_SECRET ?? "dev"}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("bad_request", "Send JSON.", 400);
  }
  const parsed = AgentRequestSchema.safeParse(body);
  if (!parsed.success) return failure("bad_request", "That question could not be read — keep it under 500 characters.", 400);

  if (!AGENT_URL || !AGENT_SECRET) {
    return failure("unavailable", "The agent is not switched on yet. The squad view works; check back shortly.");
  }

  let squad;
  try {
    squad = await loadSquad(parsed.data.teamId);
  } catch {
    return failure("unavailable", "Could not load this team from FPL right now. Try again in a minute.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({ ...parsed.data, squad, visitor: hashIp(request) }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    return failure("unavailable", "The agent did not answer. It may be waking up — try again in 30 seconds.");
  }
  if (!upstream.ok || !upstream.body) {
    return failure("unavailable", `The agent is unavailable right now (HTTP ${upstream.status}).`);
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
