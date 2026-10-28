import { z } from "zod";

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
  /** Streamed answer text. */
  | { type: "text"; delta: string }
  | { type: "done"; costUsd: number | null; turns: number; remainingToday: number | null }
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
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentTurn = z.infer<typeof TurnSchema>;

/** Questions per visitor per UK day, and the service-wide daily spend cap. */
export const AGENT_LIMITS = {
  /** Mirrors `daily_limit` in api.consume_question() — a test asserts they match. */
  questionsPerAccountPerDay: 10,
  /**
   * The agent service's own backstop per caller. Callers are accounts (the
   * website enforces the account limit first) and the daily demo recorder;
   * anonymous visitors never reach the agent.
   */
  questionsPerCallerPerDay: 10,
  dailyBudgetUsd: 0.5,
  perQuestionBudgetUsd: 0.03,
  maxTurns: 8,
  historyTurns: 6,
} as const;
