"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentTurn, HighlightTone, TeamPlan } from "@fpl/shared";

export type Highlight = { id: number; tone: HighlightTone; note: string };
export type PlanEvent = Extract<AgentEvent, { type: "plan" }>;

interface TraceRow {
  id: string;
  label: string;
  summary: string | null;
  isError: boolean;
}

interface Turn {
  question: string;
  trace: TraceRow[];
  answer: string;
  state: "running" | "done" | "error";
  error?: string;
  /** The co-pilot changed the team in this turn. */
  acted?: boolean;
  /** Declined as off-topic: not counted. */
  offTopic?: boolean;
}

/** Minimal, safe rendering: paragraphs, bullet lists and **bold**. Never HTML. */
function Rich({ text }: { text: string }) {
  const bold = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
    );
  return (
    <>
      {text
        .trim()
        .split(/\n{2,}/)
        .map((block, b) => {
          const lines = block.split("\n");
          if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
            return (
              <ul key={b}>
                {lines.map((l, i) => (
                  <li key={i}>{bold(l.replace(/^\s*[-•*]\s+/, ""), `${b}-${i}`)}</li>
                ))}
              </ul>
            );
          }
          return <p key={b}>{lines.flatMap((l, i) => (i ? [<br key={`br-${i}`} />, ...bold(l, `${b}-${i}`)] : bold(l, `${b}-${i}`)))}</p>;
        })}
    </>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read an NDJSON response, calling `onEvent` for each event as it arrives. */
async function readEvents(res: Response, onEvent: (e: AgentEvent) => void | Promise<void>) {
  if (!res.body) throw new Error("No answer came back.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) if (raw.trim()) await onEvent(JSON.parse(raw) as AgentEvent);
  }
  if (buffer.trim()) await onEvent(JSON.parse(buffer) as AgentEvent);
}

type Props =
  | {
      mode: "live";
      suggestions: readonly string[];
      remaining: number;
      limit: number;
      pending: string | null;
      onPendingConsumed: () => void;
      onHighlight: (h: Highlight[]) => void;
      onPlan: (e: PlanEvent) => void;
      /** The plan the manager applied, sent with each question so the co-pilot continues from it. */
      appliedPlan: TeamPlan | null;
    }
  | {
      mode: "demo";
      questions: readonly string[];
      pending: number | null;
      onPendingConsumed: () => void;
      onHighlight: (h: Highlight[]) => void;
      onPlan: (e: PlanEvent) => void;
    };

export function Copilot(props: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [remaining, setRemaining] = useState(props.mode === "live" ? props.remaining : 0);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const busy = turns.some((t) => t.state === "running");
  const { onHighlight, onPendingConsumed, onPlan } = props;
  const appliedPlan = props.mode === "live" ? props.appliedPlan : null;

  const patchLast = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? fn(t) : t)));

  /** One event from the agent, live or replayed. */
  const apply = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "tool_call":
          patchLast((t) => ({ ...t, trace: [...t.trace, { id: event.id, label: event.label, summary: null, isError: false }] }));
          break;
        case "tool_result":
          patchLast((t) => ({
            ...t,
            trace: t.trace.map((r) => (r.id === event.id ? { ...r, summary: event.summary, isError: event.isError } : r)),
          }));
          break;
        case "highlight":
          onHighlight(event.players);
          break;
        case "plan":
          onPlan(event);
          patchLast((t) => ({ ...t, acted: true }));
          break;
        case "text":
          patchLast((t) => ({ ...t, answer: t.answer + event.delta }));
          break;
        case "done":
          if (event.remaining !== null) setRemaining(event.remaining);
          patchLast((t) => ({ ...t, state: "done", ...(event.offTopic ? { offTopic: true } : {}) }));
          break;
        case "error":
          if (event.code === "rate_limited") setRemaining(0);
          patchLast((t) => ({ ...t, state: "error", error: event.message }));
          break;
      }
    },
    [onHighlight, onPlan],
  );

  const start = (question: string) => {
    onHighlight([]);
    // On phones the panel sits under the pitch: bring the answer into view.
    if (window.matchMedia("(max-width: 1179px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTurns((ts) => [...ts, { question, trace: [], answer: "", state: "running" }]);
  };

  const finish = () => patchLast((t) => (t.state === "running" ? { ...t, state: "done" } : t));
  const fail = (error: unknown) =>
    patchLast((t) => ({ ...t, state: "error", error: error instanceof Error ? error.message : "Something went wrong." }));

  const askLive = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput("");
      const history: AgentTurn[] = turns
        .filter((t) => t.state === "done")
        .slice(-3)
        .flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.answer },
        ]);
      start(q);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q, history, plan: appliedPlan }),
        });
        await readEvents(res, apply);
        finish();
      } catch (error) {
        fail(error);
      }
    },
    [apply, busy, turns, appliedPlan],
  );

  /** Demo: fetch the day's recording and replay it at the pace of a live answer. */
  const askDemo = useCallback(
    async (index: number) => {
      if (props.mode !== "demo" || busy) return;
      setAsked((s) => new Set(s).add(index));
      start(props.questions[index]!);
      try {
        const res = await fetch(`/api/demo?q=${index}`);
        const events: AgentEvent[] = [];
        await readEvents(res, (e) => {
          events.push(e);
        });
        for (const e of events) {
          if (e.type === "text") {
            // Re-stream the words so it reads like the live co-pilot.
            for (const piece of e.delta.match(/\S+\s*|\s+/g) ?? []) {
              apply({ type: "text", delta: piece });
              await sleep(18);
            }
            continue;
          }
          apply(e);
          await sleep(e.type === "tool_call" ? 380 : e.type === "tool_result" ? 220 : 60);
        }
        finish();
      } catch (error) {
        fail(error);
      }
    },
    [apply, busy, props.mode],
  );

  // A question handed over from a player card.
  useEffect(() => {
    if (props.pending === null || busy) return;
    const pending = props.pending;
    onPendingConsumed();
    if (typeof pending === "number") void askDemo(pending);
    else void askLive(pending);
  }, [props.pending, busy, askDemo, askLive, onPendingConsumed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const live = props.mode === "live";
  const out = live && remaining <= 0;

  return (
    <section className="copilot" aria-label="Co-pilot" ref={panelRef}>
      <header className="copilot-head">
        <span className="on-air">Co-pilot</span>
        {live ? (
          <span className={`copilot-left${out ? " out" : ""}`}>
            <b>{Math.max(remaining, 0)}</b> of {props.limit} questions left
          </span>
        ) : (
          <span className="copilot-left">Demo · recorded this gameweek</span>
        )}
      </header>

      <div className="copilot-log" ref={logRef} aria-live="polite">
        {turns.length === 0 && (
          <div className="copilot-empty">
            <h3>{live ? "Your co-pilot, on duty" : "Give it a job"}</h3>
            <p>
              Ask it to pick your XI, rate your lineup, make a transfer or choose a captain — it makes the changes on your
              pitch for you to apply or revert, with the numbers behind every call.
            </p>
            {live && (
              <div className="copilot-chips">
                {props.suggestions.map((s) => (
                  <button key={s} type="button" className="q-chip" onClick={() => void askLive(s)} disabled={busy || out}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t, i) => (
          <article className="turn" key={i}>
            <div className="turn-q">{t.question}</div>
            {(t.trace.length > 0 || t.state === "running") && (
              <ol className="turn-trace" aria-label="Lookups">
                {t.trace.map((r) => (
                  <li key={r.id} className={r.summary === null ? "run" : r.isError ? "err" : "ok"}>
                    <span className="sym" aria-hidden="true">
                      {r.summary === null ? <i className="spinner" /> : r.isError ? "✕" : "✓"}
                    </span>
                    <code>{r.label}</code>
                    {r.summary !== null && <span className="res">{r.summary}</span>}
                  </li>
                ))}
                {t.state === "running" && t.trace.length === 0 && (
                  <li className="run">
                    <span className="sym" aria-hidden="true">
                      <i className="spinner" />
                    </span>
                    <span className="res">Reading your squad…</span>
                  </li>
                )}
              </ol>
            )}
            {t.answer && (
              <div className="turn-answer">
                <Rich text={t.answer} />
                {t.state === "running" && <span className="caret" aria-hidden="true" />}
              </div>
            )}
            {t.state === "error" && <div className="notice error">{t.error}</div>}
            {t.state === "done" &&
              (t.offTopic ? (
                <div className="turn-meta">
                  <span>Not counted towards your questions</span>
                </div>
              ) : (
                <div className="turn-meta">
                  {t.acted && <span className="acted">Changes on your pitch ↑</span>}
                  <span>Numbers from {t.trace.length} lookup{t.trace.length === 1 ? "" : "s"}</span>
                  <span className="est">Forward-looking = estimate</span>
                </div>
              ))}
          </article>
        ))}
      </div>

      {live && turns.length > 0 && !out && (
        <div className="chip-row" aria-label="Suggestions">
          {props.suggestions.map((s) => (
            <button key={s} type="button" className="q-mini" onClick={() => void askLive(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      {live ? (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void askLive(input);
          }}
        >
          <textarea
            rows={1}
            maxLength={500}
            value={input}
            disabled={out}
            placeholder={out ? `You've used your ${props.limit} questions` : "Pick my XI, captain Salah, bring in a midfielder…"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void askLive(input);
              }
            }}
            aria-label="Your question"
          />
          <button type="submit" className="send" disabled={busy || out || input.trim().length < 2} aria-label="Ask">
            {busy ? (
              <i className="spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </form>
      ) : (
        <div className="demo-dock">
          <div className="copilot-chips">
            {props.questions.map((q, i) => (
              <button key={q} type="button" className={`q-chip${asked.has(i) ? " seen" : ""}`} onClick={() => void askDemo(i)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
          <p className="demo-note">
            Recorded once a gameweek for this team. <Link href="/sign-up">Create a free account</Link> and the co-pilot
            manages yours — 5 questions included.
          </p>
        </div>
      )}
    </section>
  );
}
