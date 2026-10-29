import { AGENT_LIMITS, AgentRequestSchema } from "@fpl/shared";
import { failure, gafferStream, NDJSON_HEADERS } from "@/lib/agent";
import { createAuthClient } from "@/lib/auth/server";
import { loadSquad } from "@/lib/squad";

/**
 * The browser's only door to the Gaffer for live questions (ADR-0014).
 *
 * Accounts only. The team is the one on the caller's profile — never one the
 * browser names. The LIFETIME allowance is checked before the agent runs, and
 * a question is COUNTED only when an answer completes (api.consume_question),
 * so a failed, interrupted or declined off-topic question never costs one.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = AgentRequestSchema.omit({ teamId: true });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("bad_request", "Send JSON.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return failure("bad_request", "Keep your question between 2 and 500 characters.", 400);

  const supabase = await createAuthClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("sign_in", "Log in to ask the Gaffer about your team.", 401);

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("my_profile").select("fpl_team_id").limit(1),
    supabase.from("my_usage_total").select("questions").limit(1),
  ]);
  const teamId = (profile?.[0] as { fpl_team_id: number | null } | undefined)?.fpl_team_id ?? null;
  if (!teamId) return failure("bad_request", "Connect your FPL team first.", 400);

  const used = (usage?.[0] as { questions: number } | undefined)?.questions ?? 0;
  const limit = AGENT_LIMITS.questionsPerAccount;
  if (used >= limit) {
    return failure("rate_limited", `You've used all ${limit} of your questions to the Gaffer. Your squad view, player cards and the demo stay free.`);
  }

  let squad;
  try {
    squad = await loadSquad(teamId);
  } catch {
    return failure("unavailable", "We couldn't load your team from FPL right now. Try again in a minute.");
  }

  const stream = gafferStream(
    {
      squad,
      question: parsed.data.question,
      history: parsed.data.history.slice(-AGENT_LIMITS.historyTurns),
      plan: parsed.data.plan,
      caller: `account:${auth.user.id}`,
    },
    {
      signal: request.signal,
      onDone: async (event) => {
        // Declined as off-topic: nothing to count.
        if (event.offTopic) return { ...event, remaining: Math.max(limit - used, 0) };
        // The answer completed: count it now, and report what is left.
        const { data } = await supabase.rpc("consume_question");
        const row = (Array.isArray(data) ? data[0] : data) as { remaining: number } | undefined;
        return { ...event, remaining: row?.remaining ?? null };
      },
    },
  );

  return new Response(stream, { headers: NDJSON_HEADERS });
}
