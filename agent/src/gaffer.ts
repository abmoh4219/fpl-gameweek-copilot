import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_LIMITS,
  applyPlan,
  describePlan,
  OFF_TOPIC_REPLY,
  type AgentEvent,
  type AgentTurn,
  type SiteCard,
  type Squad,
  type TeamPlan,
  type TeamRun,
} from "@fpl/shared";
import { hasAnthropicKey, MODEL, PRICE_PER_MTOK } from "./config.ts";
import { allCards, allTeamRuns } from "./data.ts";
import { admit, recordSpend, refund } from "./limits.ts";
import { buildPrompt, squadSnapshot, SYSTEM_PROMPT } from "./prompt.ts";
import { toApiTool } from "./tool.ts";
import { buildTools, startDraft } from "./tools.ts";

/**
 * The Gaffer's loop (ADR-0014): Claude Haiku 5.5 on the Messages API with our
 * own tools, run in-process by the website. Each model turn streams its text
 * to the browser; tool calls run in code and their results go back as one
 * user message. Exactly one terminal event — `done` or `error` — ends every
 * run.
 */
export interface GafferInput {
  squad: Squad;
  question: string;
  history: AgentTurn[];
  plan: TeamPlan | null;
  /** Who is asking, for the per-caller backstop: `account:<id>` or `demo`. */
  caller: string;
}

export interface GafferOptions {
  /** Stops the run when the visitor leaves. */
  signal?: AbortSignal;
  /** Injected in tests; otherwise a client reading ANTHROPIC_API_KEY. */
  client?: Pick<Anthropic, "messages">;
  /** Injected in tests; otherwise read from the public views. */
  data?: { cards: SiteCard[]; teamCodes: Map<number, number>; runs: TeamRun[] };
}

const MAX_TOKENS = 4096;

/** What one model turn cost, from the token counts the API reports. */
export function turnCostUsd(usage: Anthropic.Usage): number {
  const p = PRICE_PER_MTOK;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

export async function runGaffer(input: GafferInput, emit: (event: AgentEvent) => void, opts: GafferOptions = {}): Promise<void> {
  const admission = admit(input.caller);
  if (!admission.ok) {
    emit({ type: "error", code: admission.code, message: admission.message });
    return;
  }
  if (!opts.client && !hasAnthropicKey()) {
    refund(input.caller);
    emit({ type: "error", code: "unavailable", message: "The Gaffer is off duty right now. See him at work in the demo; your squad view still works." });
    return;
  }

  let streamedText = false;
  let answer = "";
  let usedTools = false;
  let costUsd = 0;
  let turns = 0;

  try {
    const client = opts.client ?? new Anthropic();
    const { cards, teamCodes } = opts.data ?? (await allCards());
    const runs = opts.data?.runs ?? (await allTeamRuns());
    const cardsById = new Map(cards.map((c) => [c.fplId, c]));
    const draft = startDraft(input.squad, input.plan, cardsById, teamCodes);
    const tools = buildTools({ squad: input.squad, cards, teamCodes, runs, plan: input.plan, emit }, draft);
    const byName = new Map(tools.map((t) => [t.name, t]));
    const apiTools = tools.map(toApiTool);

    const snapshot = squadSnapshot(
      applyPlan(input.squad, draft.plan, draft.incoming) ?? input.squad,
      cardsById,
      describePlan(input.squad, draft.plan, draft.incoming),
    );
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: buildPrompt(input.question, input.history.slice(-AGENT_LIMITS.historyTurns), snapshot) },
    ];

    let stopNote: string | null = null;
    for (;;) {
      turns += 1;
      const stream = client.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // The frozen prompt and the deterministic tool list come first and are
          // cached; the squad and the question follow, after the breakpoint.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: apiTools,
          output_config: { effort: "medium" },
          messages,
        },
        opts.signal ? { signal: opts.signal } : undefined,
      );

      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          usedTools = true;
          // Text written before a tool call is a preamble; keep it apart from the answer.
          if (streamedText) emit({ type: "text", delta: "\n\n" });
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          streamedText = true;
          answer += event.delta.text;
          emit({ type: "text", delta: event.delta.text });
        }
      }
      const message = await stream.finalMessage();
      costUsd += turnCostUsd(message.usage);

      if (message.stop_reason === "refusal") {
        if (!streamedText) emit({ type: "text", delta: "I can't help with that one. Ask me about your squad, captain, transfers or fixtures." });
        break;
      }
      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

      if (turns >= AGENT_LIMITS.maxTurns || costUsd >= AGENT_LIMITS.perQuestionBudgetUsd) {
        stopNote = "I hit my per-question limit before finishing. Try a narrower question — about one player or one position.";
        break;
      }

      // Every tool call of this turn runs, and all results go back in ONE message.
      messages.push({ role: "assistant", content: message.content });
      const results = await Promise.all(
        toolUses.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
          const t = byName.get(call.name);
          const parsed = t?.schema.safeParse(call.input);
          if (!t || !parsed?.success) {
            return { type: "tool_result", tool_use_id: call.id, is_error: true, content: `Invalid call to ${call.name}: check the arguments.` };
          }
          const result = await t.handler(parsed.data as never);
          const text = result.content.map((c) => c.text).join("\n");
          return { type: "tool_result", tool_use_id: call.id, content: text, ...(result.isError ? { is_error: true } : {}) };
        }),
      );
      messages.push({ role: "user", content: results });
    }

    recordSpend(costUsd);
    if (stopNote) {
      if (!streamedText) emit({ type: "text", delta: stopNote });
      emit({ type: "done", costUsd, turns, remaining: admission.remainingAfter });
      return;
    }
    // A declined off-topic question is never counted, here or by the website.
    const offTopic = !usedTools && answer.trim().startsWith(OFF_TOPIC_REPLY.slice(0, 40));
    if (offTopic) refund(input.caller);
    emit({
      type: "done",
      costUsd,
      turns,
      remaining: offTopic ? admission.remainingAfter + 1 : admission.remainingAfter,
      ...(offTopic ? { offTopic: true } : {}),
    });
  } catch (error) {
    recordSpend(costUsd);
    if (opts.signal?.aborted) return; // the visitor left; nobody is listening
    if (!streamedText) refund(input.caller);
    console.error("gaffer failed:", error instanceof Error ? error.message : error);
    if (error instanceof Anthropic.AuthenticationError) {
      emit({ type: "error", code: "unavailable", message: "The Gaffer is off duty right now. See him at work in the demo; your squad view still works." });
    } else if (error instanceof Anthropic.RateLimitError) {
      emit({ type: "error", code: "unavailable", message: "The Gaffer is busy right now. Try again in a minute." });
    } else {
      emit({ type: "error", code: "failed", message: "The Gaffer ran into a problem. Try again in a moment." });
    }
  }
}
