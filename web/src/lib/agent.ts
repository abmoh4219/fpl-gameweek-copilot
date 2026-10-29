import { runGaffer, type GafferInput } from "@fpl/agent";
import type { AgentEvent } from "@fpl/shared";

/**
 * Running the Gaffer from the website (ADR-0014). Server-only: it runs inside
 * this process with ANTHROPIC_API_KEY, which never reaches a browser.
 */
export function line(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-accel-buffering": "no",
} as const;

export function failure(code: Extract<AgentEvent, { type: "error" }>["code"], message: string, status = 200): Response {
  return new Response(line({ type: "error", code, message }), { status, headers: NDJSON_HEADERS });
}

type DoneEvent = Extract<AgentEvent, { type: "done" }>;

/**
 * The Gaffer's events as an NDJSON stream for the browser. `onDone` may
 * rewrite the final event (to count the question and report what is left)
 * before it is sent; the browser never sees spend.
 */
export function gafferStream(
  input: GafferInput,
  opts: { signal?: AbortSignal; onDone?: (event: DoneEvent) => Promise<DoneEvent> } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          // The browser went away; nothing left to tell it.
        }
      };
      let done: DoneEvent | null = null;
      await runGaffer(input, (event) => (event.type === "done" ? (done = event) : send(event)), opts.signal ? { signal: opts.signal } : {});
      if (done) {
        const final: DoneEvent = opts.onDone ? await opts.onDone(done) : done;
        send({ ...final, costUsd: null });
      }
      try {
        controller.close();
      } catch {
        // Already closed by a cancelled request.
      }
    },
  });
}

/** Every event of one run, for the demo's recording. */
export async function collectGaffer(input: GafferInput): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  await runGaffer(input, (event) => events.push(event));
  return events;
}
