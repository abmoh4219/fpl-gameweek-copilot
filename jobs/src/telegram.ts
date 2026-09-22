/**
 * Failure alerts, sent DIRECTLY from code rather than through Make.
 *
 * Make is part of the pipeline being monitored: routing alerts through it
 * means a Make outage is silent. This path depends on nothing but the
 * Telegram Bot API.
 */
import { errorMessage } from "./http.ts";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Patterns that must never reach a chat message or a log line. Belt and
 * braces alongside redactEnvValues below: this catches a secret that arrived
 * in an error string from somewhere we did not anticipate.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /postgres(?:ql)?:\/\/[^\s"']+/gi, // connection strings, including the password
  /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, // Telegram bot tokens
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, // Supabase API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWTs
  /\bhttps:\/\/hook\.(?:eu\d+\.)?make\.com\/[A-Za-z0-9]+/gi, // Make webhooks
];

/** Environment variables whose VALUES must be scrubbed if they ever appear. */
const SECRET_ENV_KEYS: readonly string[] = [
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FOOTBALL_DATA_API_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "MAKE_WEBHOOK_SECRET",
  "MAKE_WEBHOOK_EVENTS_URL",
  "MAKE_WEBHOOK_PREVIEW_URL",
  "GEMINI_API_KEY",
];

/** Removes anything secret from text before it is logged or sent. */
export function redactSecrets(text: string): string {
  let safe = text;

  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    // Short values are too likely to be a placeholder or a common substring.
    if (value && value.length >= 8) {
      safe = safe.split(value).join(`[redacted:${key}]`);
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    safe = safe.replace(pattern, "[redacted]");
  }

  return safe;
}

/** Link back to the workflow run, when we are running in one. */
export function actionsRunUrl(): string | undefined {
  const server = process.env["GITHUB_SERVER_URL"];
  const repo = process.env["GITHUB_REPOSITORY"];
  const runId = process.env["GITHUB_RUN_ID"];
  if (!server || !repo || !runId) return undefined;
  return `${server}/${repo}/actions/runs/${runId}`;
}

export interface AlertInput {
  jobName: string;
  title: string;
  detail: string;
}

/**
 * Sends an alert. Never throws: a Telegram outage must not replace or hide
 * the original error that triggered the alert.
 */
export async function sendAlert(input: AlertInput): Promise<boolean> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_ALERT_CHAT_ID"];

  if (!token || !chatId) {
    console.warn(
      "  telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set, alert not sent",
    );
    return false;
  }

  const runUrl = actionsRunUrl();
  const lines = [
    `FPL Copilot — ${input.title}`,
    `job: ${input.jobName}`,
    "",
    redactSecrets(input.detail).slice(0, 1500),
  ];
  if (runUrl) lines.push("", `run: ${runUrl}`);

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Log the status only — the URL contains the bot token.
      console.error(`  telegram: send failed with HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`  telegram: send failed: ${redactSecrets(errorMessage(error))}`);
    return false;
  }
}
