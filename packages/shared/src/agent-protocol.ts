import { z } from "zod";
import { TeamPlanSchema, type TeamPlan } from "./plan.ts";
import type { SquadPlayer } from "./squad.ts";

/**
 * The contract between the agent service, the website's proxy and the
 * browser (docs/agent-plan.md §5). Newline-delimited JSON, one event per
 * line, in the order they happen. Shared so the three can never drift.
 */

export type HighlightTone = "sell" | "buy" | "keep" | "watch";

export type AgentEvent =
  /** The agent started a tool. `label` is human-readable, e.g. get_player("Saka"). */
  | { type: "tool_call"; id: string; name: string; label: string }
  /** A tool finished. `summary` is one short line computed by code. */
  | { type: "tool_result"; id: string; summary: string; isError: boolean }
  /** Players to light up on the pitch. */
  | { type: "highlight"; players: { id: number; tone: HighlightTone; note: string }[] }
  /**
   * The co-pilot changed the manager's team: the whole proposed plan, the
   * players it buys, and the changes in plain words. The pitch shows it with
   * Apply and Revert.
   */
  | { type: "plan"; plan: TeamPlan; incoming: SquadPlayer[]; changes: string[] }
  /** Streamed answer text. */
  | { type: "text"; delta: string }
  /**
   * `remaining` is the account's questions left (lifetime), when known.
   * `offTopic` marks a declined question, which is never counted.
   */
  | { type: "done"; costUsd: number | null; turns: number; remaining: number | null; offTopic?: boolean }
  | { type: "error"; code: "rate_limited" | "budget" | "unavailable" | "bad_request" | "failed" | "sign_in"; message: string };

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

/** What the browser POSTs to /api/agent. */
export const AgentRequestSchema = z.object({
  teamId: z.number().int().positive().max(999_999_999),
  question: z.string().trim().min(2).max(500),
  history: z.array(TurnSchema).max(12).default([]),
  /** The plan the manager has applied in Armband, so the co-pilot continues from it. */
  plan: TeamPlanSchema.nullable().default(null),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentTurn = z.infer<typeof TurnSchema>;

/**
 * The co-pilot's reply to anything that is not about FPL or football, word
 * for word. The service recognises it and does not count the question.
 */
export const OFF_TOPIC_REPLY =
  "I'm Armband, your FPL co-pilot — I only help with Fantasy Premier League and your squad. Ask me about your captain, lineup, transfers or fixtures.";

/** What a question may cost, and how many each account gets. */
export const AGENT_LIMITS = {
  /**
   * Questions per account, FOR LIFE — the key is small. Mirrors
   * `lifetime_limit` in api.consume_question(); a test asserts they match.
   */
  questionsPerAccount: 5,
  /**
   * The agent service's own backstop per caller. Callers are accounts (the
   * website enforces the account limit first) and the daily demo recorder;
   * anonymous visitors never reach the agent.
   */
  questionsPerCallerPerDay: 10,
  dailyBudgetUsd: 0.5,
  perQuestionBudgetUsd: 0.02,
  maxTurns: 6,
  historyTurns: 4,
} as const;
