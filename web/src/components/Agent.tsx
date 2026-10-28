"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentTurn, HighlightTone } from "@fpl/shared";

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
  costUsd?: number | null;
}

const SUGGESTIONS = [
  "Who should I captain this week?",
  "Who is my weakest starter, and who replaces him within my budget?",
  "Is anyone in my squad injured or doubtful?",
  "Which of my players have the hardest next 5 fixtures?",
];

/** Minimal, safe rendering: paragraphs, bullet lists and **bold**. No HTML injection. */
function Rich({ text }: { text: string }) {
  const bold = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
    );
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, b) => {
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

export function Agent({
  teamId,
  initialQuestion,
  pendingQuestion,
  onPendingConsumed,
  onHighlight,
}: {
  teamId: number;
  initialQuestion: string | null;
  pendingQuestion: string | null;
  onPendingConsumed: () => void;
  onHighlight: (players: { id: number; tone: HighlightTone; note: string }[]) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.state === "running");
  const askedInitial = useRef(false);

  const patchLast = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? fn(t) : t)));

  const ask = useCallback(
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
      setTurns((ts) => [...ts, { question: q, trace: [], answer: "", state: "running" }]);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ teamId, question: q, history }),
        });
        if (!res.ok || !res.body) throw new Error(`The agent is unavailable (HTTP ${res.status}).`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as AgentEvent;
            switch (event.type) {
              case "tool_call":
                patchLast((t) => ({
                  ...t,
                  trace: [...t.trace, { id: event.id, label: event.label, summary: null, isError: false }],
                }));
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
              case "text":
                patchLast((t) => ({ ...t, answer: t.answer + event.delta }));
                break;
              case "done":
                if (event.remainingToday !== null) setRemaining(event.remainingToday);
                patchLast((t) => ({ ...t, state: "done", costUsd: event.costUsd }));
                break;
              case "error":
                if (event.code === "rate_limited") setRemaining(0);
                patchLast((t) => ({ ...t, state: "error", error: event.message }));
                break;
            }
          }
        }
        patchLast((t) => (t.state === "running" ? { ...t, state: "done" } : t));
      } catch (error) {
        patchLast((t) => ({
          ...t,
          state: "error",
          error: error instanceof Error ? error.message : "Something went wrong.",
        }));
      }
    },
    [busy, onHighlight, teamId, turns],
  );

  useEffect(() => {
    if (initialQuestion && !askedInitial.current) {
      askedInitial.current = true;
      void ask(initialQuestion);
    }
  }, [initialQuestion, ask]);

  useEffect(() => {
    if (pendingQuestion && !busy) {
      onPendingConsumed();
      void ask(pendingQuestion);
    }
  }, [pendingQuestion, busy, ask, onPendingConsumed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns]);

  return (
    <section className="agent" aria-label="Ask the agent">
      <div className="agent-head">
        <div className="agent-title">
          <span className="agent-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1 L9.6 6.4 L15 8 L9.6 9.6 L8 15 L6.4 9.6 L1 8 L6.4 6.4 Z" fill="currentColor" />
            </svg>
          </span>
          <div>
            Copilot agent
            <div className="agent-sub">Claude Agent SDK · Haiku 5.5 · 8 read-only tools</div>
          </div>
        </div>
        <span className="tag">{remaining === null ? "5 / day" : `${remaining} left today`}</span>
      </div>

      <div className="agent-log" ref={logRef}>
        {turns.length === 0 && (
          <div className="agent-empty">
            <div className="section-label" style={{ marginBottom: 6 }}>
              <b>ask</b> / about this squad
            </div>
            <h3>What do you want to know?</h3>
            <p>
              The agent reads this squad and our computed data. Every tool it calls appears below as it runs, and the
              players it talks about light up on the pitch.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => void ask(s)}>
                  <span>{s}</span>
                  <span className="faint">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i}>
            <div className="msg-user">
              <div>{t.question}</div>
            </div>
            <div className="turn">
              {(t.trace.length > 0 || t.state === "running") && (
                <div className="trace" aria-label="Agent tool calls">
                  <div className="trace-head">
                    <span>agent trace</span>
                    <span>{t.state === "running" ? "working…" : `${t.trace.length} tool call${t.trace.length === 1 ? "" : "s"}`}</span>
                  </div>
                  {t.trace.map((r) => (
                    <div key={r.id} className={`trace-row${r.summary === null ? "" : r.isError ? " err" : " done"}`}>
                      <span className="sym">{r.summary === null ? <i className="spin" /> : r.isError ? "✕" : "✓"}</span>
                      <span className="call">
                        {r.label}
                        {r.summary !== null && <span className="res">→ {r.summary}</span>}
                      </span>
                    </div>
                  ))}
                  {t.state === "running" && t.trace.length === 0 && (
                    <div className="trace-row">
                      <span className="sym">
                        <i className="spin" />
                      </span>
                      <span className="call faint">planning…</span>
                    </div>
                  )}
                </div>
              )}
              {t.answer && (
                <div className="answer">
                  <Rich text={t.answer} />
                </div>
              )}
              {t.state === "error" && <div className="notice error">{t.error}</div>}
              {t.state === "done" && (
                <div className="answer-meta">
                  <span className="tag">numbers from tools</span>
                  <span className="tag tag-warn">estimates labelled</span>
                  {typeof t.costUsd === "number" && <span className="tag">${t.costUsd.toFixed(4)}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="agent-input">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <textarea
            rows={1}
            maxLength={500}
            placeholder={remaining === 0 ? "Daily limit reached — come back tomorrow" : "Ask about captaincy, transfers, fixtures…"}
            value={input}
            disabled={remaining === 0}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            aria-label="Your question"
          />
          <button className="btn btn-accent" type="submit" disabled={busy || !input.trim() || remaining === 0}>
            {busy ? <i className="spin" /> : "Ask"}
          </button>
        </form>
        <div className="fineprint">
          Answers use only numbers our pipeline computed. Forward-looking values are estimates. Not financial advice —
          it is a game.
        </div>
      </div>
    </section>
  );
}
