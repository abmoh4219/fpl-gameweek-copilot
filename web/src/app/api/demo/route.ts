import { unstable_cache } from "next/cache";
import type { AgentEvent } from "@fpl/shared";
import { DEMO_TEAM_ID } from "@/components/site/links";
import { collectGaffer, failure, NDJSON_HEADERS } from "@/lib/agent";
import { DEMO_QUESTIONS } from "@/lib/demo";
import { loadSquad } from "@/lib/squad";

/**
 * GET /api/demo?q=0..3 — the recorded answer to one demo question, as the
 * full list of agent events. The browser replays them with the timing of a
 * live answer. Visitors never trigger a run: the first request of a gameweek
 * records it, every later one is served from the cache (CLAUDE.md §7).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

class NotRecorded extends Error {}

async function record(q: number): Promise<AgentEvent[]> {
  const squad = await loadSquad(DEMO_TEAM_ID);
  const events = await collectGaffer({ squad, question: DEMO_QUESTIONS[q]!, history: [], plan: null, caller: "demo" });
  // Only a complete, successful answer is worth keeping for a gameweek. Throwing
  // means nothing is cached and the next visitor tries again.
  const done = events.some((e) => e.type === "done");
  const answered = events.some((e) => e.type === "text");
  if (!done || !answered || events.some((e) => e.type === "error")) throw new NotRecorded("incomplete answer");
  // Spend is internal; the browser never sees it.
  return events.map((e) => (e.type === "done" ? { ...e, costUsd: null, remaining: null } : e));
}

// One shared cache entry per (gameweek, question). The gameweek in the key is
// what rolls the answers over; the long revalidate is only a safety net.
const recorded = unstable_cache(async (_gameweek: number, q: number) => record(q), ["demo-answer-v5"], {
  revalidate: 60 * 60 * 24 * 8,
});

// Within one server instance, concurrent first visitors share one recording.
const inFlight = new Map<string, Promise<AgentEvent[]>>();

export async function GET(request: Request): Promise<Response> {
  const q = Number(new URL(request.url).searchParams.get("q"));
  if (!Number.isInteger(q) || q < 0 || q >= DEMO_QUESTIONS.length) return failure("bad_request", "Unknown demo question.", 400);

  let gameweek: number;
  try {
    gameweek = (await loadSquad(DEMO_TEAM_ID)).gameweek;
  } catch {
    return failure("unavailable", "FPL isn't answering right now. Try the demo again in a few minutes.");
  }
  const key = `${gameweek}:${q}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = recorded(gameweek, q).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  try {
    const events = await pending;
    return new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(""), { headers: NDJSON_HEADERS });
  } catch {
    return failure("unavailable", "This demo answer isn't ready right now. Try another question, or come back in a minute.");
  }
}
