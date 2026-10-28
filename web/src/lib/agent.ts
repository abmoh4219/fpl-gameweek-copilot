import { createHash } from "node:crypto";
import type { AgentEvent, AgentTurn, Squad } from "@fpl/shared";

/**
 * Talking to the agent service (ADR-0009). Server-only: the service URL and
 * its shared secret never reach a browser.
 */
const AGENT_URL = process.env["AGENT_URL"];
const AGENT_SECRET = process.env["AGENT_SHARED_SECRET"];

export const agentConfigured = () => Boolean(AGENT_URL && AGENT_SECRET);

export function line(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-accel-buffering": "no",
} as const;

export function failure(code: Extract<AgentEvent, { type: "error" }>["code"], message: string, status = 200): Response {
  return new Response(line({ type: "error", code, message }), { status, headers: NDJSON_HEADERS });
}

/**
 * Who is asking, as the agent service's per-caller backstop sees it: a
 * salted hash, so the service can count a caller without knowing who it is.
 */
export function callerId(raw: string): string {
  return createHash("sha256").update(`${AGENT_SECRET ?? "dev"}:${raw}`).digest("hex").slice(0, 32);
}

export type AgentCall = { ok: true; body: ReadableStream<Uint8Array> } | { ok: false; message: string };

export async function callAgent(input: {
  squad: Squad;
  question: string;
  history: AgentTurn[];
  caller: string;
}): Promise<AgentCall> {
  if (!AGENT_URL || !AGENT_SECRET) return { ok: false, message: "The co-pilot isn't switched on yet. Your squad view still works." };
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": AGENT_SECRET },
      body: JSON.stringify({
        teamId: input.squad.entryId,
        question: input.question,
        history: input.history,
        squad: input.squad,
        visitor: input.caller,
      }),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "The co-pilot didn't answer. It may be waking up — try again in 30 seconds." };
  }
  if (!res.ok || !res.body) return { ok: false, message: "The co-pilot is unavailable right now. Try again in a minute." };
  return { ok: true, body: res.body };
}

/**
 * Split an NDJSON byte stream into events, letting `onEvent` rewrite or drop
 * each one before it is passed on. Lines that are not valid JSON are dropped.
 */
export function mapEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentEvent) => Promise<AgentEvent | null> | AgentEvent | null,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const handle = async (raw: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!raw.trim()) return;
    let event: AgentEvent;
    try {
      event = JSON.parse(raw) as AgentEvent;
    } catch {
      return;
    }
    const out = await onEvent(event);
    if (out) controller.enqueue(encoder.encode(line(out)));
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) await handle(raw, controller);
      },
      async flush(controller) {
        await handle(buffer, controller);
      },
    }),
  );
}
