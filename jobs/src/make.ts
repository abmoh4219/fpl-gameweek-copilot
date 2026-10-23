/**
 * Delivery to Make Scenario 1 — ONE POST per run, batched payload
 * (CLAUDE.md §4, ADR-0006).
 *
 * The shared secret travels in the JSON body and Make's first filter checks
 * it, so a stranger who finds the webhook URL cannot post to the channel. A
 * body field rather than a header because Make filters on body fields
 * directly; over HTTPS the two are equally private.
 *
 * No retry. Make answers "Accepted" as soon as it has queued the run, so a
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

/** Reads the webhook config, or explains what is missing. Never logs values. */
export function eventsWebhookTarget(): WebhookTarget | { missing: string[] } {
  const url = process.env["MAKE_WEBHOOK_EVENTS_URL"];
  const secret = process.env["MAKE_WEBHOOK_SECRET"];
  const missing = [
    ...(url ? [] : ["MAKE_WEBHOOK_EVENTS_URL"]),
    ...(secret ? [] : ["MAKE_WEBHOOK_SECRET"]),
  ];
  return url && secret ? { url, secret } : { missing };
}

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
