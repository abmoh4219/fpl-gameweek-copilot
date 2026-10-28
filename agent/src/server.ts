import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_LIMITS, AgentRequestSchema, type AgentEvent, type Squad } from "@fpl/shared";
import { z } from "zod";
import { config } from "./config.ts";
import { allCards, allTeamRuns } from "./data.ts";
import { admit, recordSpend, refund, usageToday } from "./limits.ts";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt.ts";
import { buildToolServer } from "./tools.ts";

/**
 * The agent service (docs/agent-plan.md §3): one HTTP endpoint, POST /chat,
 * reachable only with the shared secret the website holds. It runs the
 * Claude Agent SDK with every built-in tool removed and only our read-only
 * FPL tools, and streams AgentEvents back as NDJSON.
 */

// Isolation per the Agent SDK hosting guide: no settings, memory or sessions
// from disk, and a private config dir.
const WORK_DIR = "/tmp/copilot-work";
const CONFIG_DIR = "/tmp/copilot-claude";
mkdirSync(WORK_DIR, { recursive: true });
mkdirSync(CONFIG_DIR, { recursive: true });

const ChatSchema = AgentRequestSchema.extend({
  // Built and sent by our own website, which loaded it from FPL and our views.
  squad: z.custom<Squad>(
    (v) => typeof v === "object" && v !== null && Array.isArray((v as Squad).starters) && Array.isArray((v as Squad).bench),
  ),
  visitor: z.string().regex(/^[a-f0-9]{8,64}$/),
});

function secretMatches(given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.sharedSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage, limit = 96_000): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function chat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!secretMatches(req.headers["x-agent-secret"] as string | undefined)) {
    res.writeHead(401).end();
    return;
  }

  let input: z.infer<typeof ChatSchema>;
  try {
    const parsed = ChatSchema.safeParse(JSON.parse(await readBody(req)));
    if (!parsed.success) throw new Error("invalid");
    input = parsed.data;
  } catch {
    res.writeHead(400).end();
    return;
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });
  let closed = false;
  const emit = (event: AgentEvent) => {
    if (!closed) res.write(`${JSON.stringify(event)}\n`);
  };

  const admission = admit(input.visitor);
  if (!admission.ok) {
    emit({ type: "error", code: admission.code, message: admission.message });
    res.end();
    return;
  }

  const abort = new AbortController();
  // The visitor left: stop paying for an answer nobody will read.
  res.on("close", () => {
    closed = true;
    abort.abort();
  });

  let finished = false;
  try {
    const [cards, runs] = await Promise.all([allCards(), allTeamRuns()]);
    const server = buildToolServer({ squad: input.squad, cards, runs, emit });
    let streamedText = false;

    for await (const message of query({
      prompt: buildPrompt(input.question, input.history.slice(-AGENT_LIMITS.historyTurns)),
      options: {
        model: config.model,
        systemPrompt: SYSTEM_PROMPT,
        tools: [], // every built-in tool removed: no shell, files or web
        mcpServers: { fpl: server },
        allowedTools: ["mcp__fpl__*"],
        settingSources: [],
        persistSession: false,
        maxTurns: AGENT_LIMITS.maxTurns,
        maxBudgetUsd: AGENT_LIMITS.perQuestionBudgetUsd,
        includePartialMessages: true,
        cwd: WORK_DIR,
        abortController: abort,
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: CONFIG_DIR,
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        },
      },
    })) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          streamedText = true;
          emit({ type: "text", delta: event.delta.text });
        }
        if (event.type === "content_block_start" && event.content_block.type === "tool_use" && streamedText) {
          // Text written before a tool call is a preamble; keep it apart from the answer.
          emit({ type: "text", delta: "\n\n" });
        }
      } else if (message.type === "result") {
        recordSpend(message.total_cost_usd);
        finished = true;
        if (message.subtype === "success" && !message.is_error) {
          emit({ type: "done", costUsd: message.total_cost_usd, turns: message.num_turns, remainingToday: admission.remainingAfter });
        } else if (message.subtype === "error_max_budget_usd" || message.subtype === "error_max_turns") {
          if (!streamedText) {
            emit({
              type: "text",
              delta: "I hit my per-question limit before finishing. Try a narrower question — about one player or one position.",
            });
          }
          emit({ type: "done", costUsd: message.total_cost_usd, turns: message.num_turns, remainingToday: admission.remainingAfter });
        } else {
          if (!streamedText) refund(input.visitor);
          emit({ type: "error", code: "failed", message: "The agent could not answer that one. Try again in a moment." });
        }
      }
    }
  } catch (error) {
    if (!abort.signal.aborted && !finished) {
      console.error("chat failed:", error instanceof Error ? error.message : error);
      refund(input.visitor);
      emit({
        type: "error",
        code: config.hasAnthropicKey ? "failed" : "unavailable",
        message: config.hasAnthropicKey
          ? "The agent ran into a problem. Try again in a moment."
          : "The agent is not switched on yet — the squad view works in the meantime.",
      });
    } else if (finished) {
      console.error("agent ended with an error result:", error instanceof Error ? error.message : error);
    }
  } finally {
    if (!closed) res.end();
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/chat") {
    void chat(req, res);
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "armband-agent", model: config.model, keyLoaded: config.hasAnthropicKey, today: usageToday() }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(config.port, () => {
  console.log(`agent listening on :${config.port} · model ${config.model} · key ${config.hasAnthropicKey ? "loaded" : "MISSING"}`);
});
