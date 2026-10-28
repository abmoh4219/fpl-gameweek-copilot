/**
 * Agent service configuration, read once at start. Secrets are Hugging Face
 * Space secrets in production (docs/agent.md) — never in git.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env["PORT"] ?? 7860),
  /** Shared with the website's /api/agent route; every request must carry it. */
  sharedSecret: required("AGENT_SHARED_SECRET"),
  supabaseUrl: required("SUPABASE_URL"),
  /** The PUBLIC key: the agent only reads the same api views the website does. */
  supabaseKey: required("SUPABASE_PUBLISHABLE_KEY"),
  model: process.env["AGENT_MODEL"] ?? "claude-haiku-5-5",
  // ANTHROPIC_API_KEY is read by the Agent SDK's subprocess from the environment.
  hasAnthropicKey: Boolean(process.env["ANTHROPIC_API_KEY"]),
};
