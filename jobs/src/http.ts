/**
 * Minimal HTTP helpers for the data syncs.
 *
 * Rules this encodes (CLAUDE.md §5, §6):
 *  - sequential requests, never a burst
 *  - browser-like User-Agent for the FPL API, which is an undocumented courtesy
 *  - football-data rate-limit headers read under BOTH names, case-insensitively
 *  - tokens never appear in logs or error messages
 */

const FPL_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips anything token-shaped out of a URL before it reaches a log line. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/token|key|secret|auth/i.test(key)) u.searchParams.set(key, "REDACTED");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export interface RateLimit {
  /** Requests left in the current minute window, if the API told us. */
  available: number | undefined;
  /** Seconds until the counter resets, if the API told us. */
  resetSeconds: number | undefined;
}

/**
 * football-data.org documents `X-RequestsAvailable` but actually sends
 * `x-requests-available-minute`. Headers.get() is already case-insensitive;
 * the spelling difference is the part we have to handle ourselves.
 */
export function readRateLimit(headers: Headers): RateLimit {
  const availableRaw =
    headers.get("x-requests-available-minute") ??
    headers.get("x-requestsavailable") ??
    headers.get("x-requests-available");
  const resetRaw =
    headers.get("x-requestcounter-reset") ?? headers.get("x-requests-reset");

  const toNumber = (v: string | null): number | undefined => {
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return { available: toNumber(availableRaw), resetSeconds: toNumber(resetRaw) };
}

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Send the browser-like User-Agent the FPL API expects. */
  browserUserAgent?: boolean;
}

export interface FetchResult {
  body: unknown;
  rateLimit: RateLimit;
}

/** GET one JSON document, with retries and rate-limit-aware backoff. */
export async function fetchJson(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers,
  };
  if (options.browserUserAgent) headers["user-agent"] = FPL_USER_AGENT;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const rateLimit = readRateLimit(res.headers);

      if (res.status === 429) {
        const wait = (rateLimit.resetSeconds ?? 60) * 1000;
        console.warn(
          `  rate limited, waiting ${Math.round(wait / 1000)}s before retrying`,
        );
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${redact(url)}`);
      }

      return { body: await res.json(), rateLimit };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const backoff = 1000 * 2 ** (attempt - 1);
      console.warn(
        `  attempt ${attempt} failed (${errorMessage(error)}), retrying in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }

  throw new Error(
    `Failed after ${MAX_ATTEMPTS} attempts: ${redact(url)} — ${errorMessage(lastError)}`,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
