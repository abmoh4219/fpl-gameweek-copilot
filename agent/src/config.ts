/**
 * The Gaffer's configuration (ADR-0014). Read when used, not at import, so
 * the website builds without these set. `ANTHROPIC_API_KEY` is a server-only
 * Vercel environment variable — never prefixed NEXT_PUBLIC_, never in git.
 */
export const MODEL = process.env["AGENT_MODEL"] ?? "claude-haiku-5-5";

/**
 * Claude Haiku 5.5, USD per million tokens, for prompts up to 100K tokens
 * (ours are a few thousand). Cache writes cost 1.25x input, cache reads 0.1x.
 * Used to enforce the per-question and daily budgets from the token counts
 * the API reports.
 */
export const PRICE_PER_MTOK = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 } as const;

export const hasAnthropicKey = (): boolean => Boolean(process.env["ANTHROPIC_API_KEY"]);

/** The public Supabase views the Gaffer reads — the same ones the website reads. */
export function supabaseConfig(): { url: string; key: string } {
  const url = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured for the Gaffer");
  return { url, key };
}
