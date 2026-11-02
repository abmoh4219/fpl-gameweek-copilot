"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FplPitch } from "@/components/pitch/FplPitch";
import { ScoreBug } from "@/components/pitch/ScoreBug";
import type { BestXiResult } from "@/lib/toolkit";

/**
 * The hero's product demo: the real best-XI result for the demo team, played
 * as a loop. The command is typed and run, the players glide to their new
 * places, the expected points roll up, then Revert puts it back. Nothing is
 * invented: `result` comes from the same engine the free toolkit uses.
 */
type Phase = "idle" | "typing" | "pressed" | "thinking" | "applied" | "reverting";

const COMMAND = "Pick my best XI";

// The loop, in ms from its start.
const BEATS = { type: 700, press: 2300, think: 2550, apply: 3700, revert: 10600, back: 10900, end: 12800 };

function useRolling(target: number, active: boolean, from: number) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, from]);
  return value;
}

/** Swap two lineups, gliding each card to its new place where the browser can. */
function transition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(update));
  else update();
}

export function HeroShow({ result }: { result: BestXiResult }) {
  const changed = result.promoted.length > 0 || result.captainChanged;
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState(0);
  const [applied, setApplied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reduced motion: show the result, still.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(COMMAND.length);
      setApplied(true);
      setPhase("applied");
      return;
    }
    let timers: number[] = [];
    let visible = false;
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const loop = () => {
      clear();
      setPhase("idle");
      setTyped(0);
      at(BEATS.type, () => setPhase("typing"));
      for (let i = 1; i <= COMMAND.length; i++) at(BEATS.type + i * 70, () => setTyped(i));
      at(BEATS.press, () => setPhase("pressed"));
      at(BEATS.think, () => setPhase("thinking"));
      at(BEATS.apply, () => {
        setPhase("applied");
        if (changed) transition(() => setApplied(true));
        else setApplied(true);
      });
      at(BEATS.revert, () => setPhase("reverting"));
      at(BEATS.back, () => {
        if (changed) transition(() => setApplied(false));
        else setApplied(false);
      });
      at(BEATS.end, () => visible && loop());
    };
    // Only play while the hero is on screen.
    const io = new IntersectionObserver(([entry]) => {
      const now = entry?.isIntersecting ?? false;
      if (now && !visible) {
        visible = true;
        loop();
      } else if (!now && visible) {
        visible = false;
        clear();
      }
    });
    if (root.current) io.observe(root.current);
    return () => {
      io.disconnect();
      clear();
    };
  }, [changed]);

  const points = useRolling(result.pointsAfter, applied, result.pointsBefore);
  const squad = applied ? result.after : result.before;
  const marks = applied
    ? new Map<number, string>([
        ...result.promoted.map((id) => [id, "In"] as [number, string]),
        ...(result.captainChanged ? [[result.after.starters.find((p) => p.isCaptain)?.fplId ?? 0, "C"] as [number, string]] : []),
      ])
    : undefined;
  const busy = phase === "thinking";
  const gain = result.pointsAfter - result.pointsBefore;

  return (
    <div className="show" ref={root} data-phase={phase}>
      <ScoreBug squad={squad} />
      <div className="show-frame">
        <div className="show-command" aria-hidden="true">
          <span className="show-prompt">
            {COMMAND.slice(0, typed)}
            {phase === "typing" && <i className="show-caret" />}
            {typed === 0 && <span className="show-placeholder">Give your team a job…</span>}
          </span>
          <span className={`show-run${phase === "pressed" ? " is-pressed" : ""}${busy ? " is-busy" : ""}`}>
            {busy ? <i className="show-spin" /> : "Run"}
          </span>
        </div>
        <div className="show-pitch">
          <FplPitch squad={squad} value="fixture" compact glide {...(marks ? { marks } : {})} />
        </div>
        <div className={`show-result${applied ? " is-on" : ""}`} aria-live="polite">
          <div className="show-points">
            <span className="mono">{points.toFixed(1)}</span>
            <small>expected points (estimate)</small>
          </div>
          <div className="show-detail">
            {changed ? (
              <>
                <b>{result.formation}</b> · {gain > 0 ? `+${gain.toFixed(1)} on your lineup` : "same points, better captain"}
              </>
            ) : (
              <b>Already your best XI</b>
            )}
          </div>
          <span className={`show-revert${phase === "reverting" ? " is-pressed" : ""}`} aria-hidden="true">
            Revert
          </span>
        </div>
        <p className="sr-only">
          Example on the demo team: picking the best XI changes {result.changes.length} things and moves the expected
          points from {result.pointsBefore.toFixed(1)} to {result.pointsAfter.toFixed(1)}, an estimate.
        </p>
      </div>
    </div>
  );
}
