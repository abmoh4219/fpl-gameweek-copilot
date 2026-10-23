/**
 * The two Make webhooks (CLAUDE.md §4):
 *   Scenario 1 — delivery, ONE batched POST per run (ADR-0006)
 *   Scenario 2 — Gemini prose for the preview, answered synchronously (ADR-0007)
 *
 * The shared secret travels in the JSON body and Make's first filter checks
 * it, so a stranger who finds the webhook URL cannot post to the channel. A
 * body field rather than a header because Make filters on body fields
 * directly; over HTTPS the two are equally private.
 *
 * No retry on either. Make answers "Accepted" as soon as it has queued the run, so a
 * timeout after a successful POST would turn a retry into a duplicate post
 * in a public channel. Undelivered events stay unnotified and the next run
 * picks them up instead.
 */
import type { DeliveryPayload } from "@fpl/shared";
import { errorMessage } from "./http.ts";
import { redactSecrets } from "./telegram.ts";

const WEBHOOK_TIMEOUT_MS = 20_000;

export interface WebhookResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export interface WebhookTarget {
  url: string;
  secret: string;
}

/** Reads a webhook's config, or explains what is missing. Never logs values. */
export function webhookTarget(
  scenario: "events" | "preview",
): WebhookTarget | { missing: string[] } {
  const urlKey = scenario === "events" ? "MAKE_WEBHOOK_EVENTS_URL" : "MAKE_WEBHOOK_PREVIEW_URL";
  const url = process.env[urlKey];
  const secret = process.env["MAKE_WEBHOOK_SECRET"];
  const missing = [...(url ? [] : [urlKey]), ...(secret ? [] : ["MAKE_WEBHOOK_SECRET"])];
  return url && secret ? { url, secret } : { missing };
}

export const eventsWebhookTarget = () => webhookTarget("events");

/** Never throws: the caller decides how loud a failed delivery should be. */
export async function postToMake(
  target: WebhookTarget,
  payload: DeliveryPayload,
): Promise<WebhookResult> {
  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, secret: target.secret }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    // Drain the body ("Accepted") so the connection is released.
    const text = (await res.text()).slice(0, 200);
    return res.ok
      ? { ok: true, status: res.status, error: null }
      : { ok: false, status: res.status, error: redactSecrets(`HTTP ${res.status}: ${text}`) };
  } catch (error) {
    return { ok: false, status: null, error: redactSecrets(errorMessage(error)) };
  }
}

export interface ProseResult extends WebhookResult {
  /** Gemini's raw text, unvalidated. Null on any failure. */
  text: string | null;
}

/**
 * Scenario 2 (ADR-0007): POST the prompt, and Make's "Webhook response"
 * module answers with Gemini's text as the HTTP body. Plain text rather than
 * JSON, so quotes in the prose cannot break Make's response template.
 *
 * Nothing here is trusted: the caller validates the text before using it.
 */
export async function requestProse(
  target: WebhookTarget,
  body: { version: number; gameweek: number; prompt: string },
  timeoutMs: number,
): Promise<ProseResult> {
  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, secret: target.secret }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: redactSecrets(`HTTP ${res.status}: ${text.slice(0, 200)}`), text: null };
    }
    // Make answers a bare "Accepted" when the scenario has no response module.
    if (text.trim() === "Accepted") {
      return { ok: false, status: res.status, error: "Make answered Accepted: Scenario 2 has no Webhook response module", text: null };
    }
    return { ok: true, status: res.status, error: null, text };
  } catch (error) {
    return { ok: false, status: null, error: redactSecrets(errorMessage(error)), text: null };
  }
}
