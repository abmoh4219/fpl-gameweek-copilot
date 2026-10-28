import { AGENT_LIMITS } from "@fpl/shared";

/**
 * Spending guards (docs/agent.md), enforced before every run:
 *   - a per-caller question limit per UK day (caller = salted hash of an
 *     account id, or of "demo" for the daily demo recording)
 *   - a service-wide daily USD cap, summed from each run's reported cost
 *
 * In memory: the Space runs as ONE container, so one process sees every
 * request. A restart resets the counters, which is why the hard ceiling is
 * the spend limit on the Anthropic key itself — this is the polite layer in
 * front of it.
 */
const ukDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

let day = ukDay();
let spentUsd = 0;
const questions = new Map<string, number>();

function roll(): void {
  const today = ukDay();
  if (today !== day) {
    day = today;
    spentUsd = 0;
    questions.clear();
  }
}

export type Admission =
  | { ok: true; remainingAfter: number }
  | { ok: false; code: "rate_limited" | "budget"; message: string };

/** Reserve one question for this visitor, or say why not. */
export function admit(visitor: string): Admission {
  roll();
  if (spentUsd >= AGENT_LIMITS.dailyBudgetUsd) {
    return {
      ok: false,
      code: "budget",
      message: "Today's agent budget is used up — it resets at midnight UK time. The squad view still works.",
    };
  }
  const asked = questions.get(visitor) ?? 0;
  if (asked >= AGENT_LIMITS.questionsPerCallerPerDay) {
    return {
      ok: false,
      code: "rate_limited",
      message: `That's your ${AGENT_LIMITS.questionsPerCallerPerDay} questions for today. They reset at midnight UK time.`,
    };
  }
  questions.set(visitor, asked + 1);
  return { ok: true, remainingAfter: AGENT_LIMITS.questionsPerCallerPerDay - asked - 1 };
}

/** Give the question back when a run failed before producing an answer. */
export function refund(visitor: string): void {
  const asked = questions.get(visitor) ?? 0;
  if (asked > 0) questions.set(visitor, asked - 1);
}

export function recordSpend(usd: number): void {
  roll();
  if (Number.isFinite(usd) && usd > 0) spentUsd += usd;
}

export function usageToday(): { day: string; spentUsd: number; visitors: number } {
  roll();
  return { day, spentUsd: Math.round(spentUsd * 10_000) / 10_000, visitors: questions.size };
}
