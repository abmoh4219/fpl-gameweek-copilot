"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyPlan, describePlan, planOf, TeamPlanSchema, type HighlightTone, type Squad, type SquadPlayer, type TeamPlan } from "@fpl/shared";
import { FplPitch, type PlateValue } from "../pitch/FplPitch";
import { ScoreBug } from "../pitch/ScoreBug";
import { Copilot, type Highlight, type PlanEvent } from "./Copilot";
import { PlayerSheet } from "./PlayerSheet";
import "./copilot.css";

interface StoredPlan {
  plan: TeamPlan;
  incoming: SquadPlayer[];
}

/**
 * The applied plan lives in this browser, per team and gameweek: Armband never
 * writes to FPL, so this is the manager's own record until they make the
 * changes in the FPL app. Storage can be unavailable; the plan then simply
 * lasts for the visit.
 */
function storageKey(mode: string, squad: Squad) {
  return `armband:plan:${mode}:${squad.entryId}:gw${squad.gameweek}`;
}

function loadPlan(key: string, squad: Squad): StoredPlan | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { plan: unknown; incoming: SquadPlayer[] };
    const plan = TeamPlanSchema.safeParse(parsed.plan);
    if (!plan.success || !Array.isArray(parsed.incoming)) return null;
    const incoming = new Map(parsed.incoming.map((p) => [p.fplId, p]));
    return applyPlan(squad, plan.data, incoming) ? { plan: plan.data, incoming: parsed.incoming } : null;
  } catch {
    return null;
  }
}

function savePlan(key: string, value: StoredPlan | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode or blocked storage: the plan lasts for this visit only.
  }
}

/**
 * Labels for the players a plan changes. Compared with planOf(base) — the
 * same baseline describePlan uses — so a vice-captain FPL lists on the bench
 * does not make an unchanged armband look like a change.
 */
function planMarks(base: Squad, shown: Squad, plan: TeamPlan): Map<number, string> {
  const marks = new Map<number, string>();
  const before = planOf(base);
  const started = new Set(before.starters);
  const bought = new Set(plan.transfers.map((t) => t.in));
  for (const p of [...shown.starters, ...shown.bench]) {
    if (bought.has(p.fplId)) marks.set(p.fplId, "In");
    else if (p.fplId === plan.captain && before.captain !== plan.captain) marks.set(p.fplId, "Captain");
    else if (p.isStarter && !started.has(p.fplId)) marks.set(p.fplId, "Start");
    else if (!p.isStarter && started.has(p.fplId)) marks.set(p.fplId, "Benched");
    else if (p.fplId === plan.vice && before.vice !== plan.vice) marks.set(p.fplId, "Vice");
  }
  return marks;
}

/**
 * The pitch and the co-pilot side by side. They share the highlights (the
 * co-pilot points at players) and the PLAN: when the co-pilot changes the
 * team, the pitch redraws with the change and offers Apply or Revert.
 */
export function Dugout(
  props: { squad: Squad } & (
    | { mode: "live"; suggestions: readonly string[]; remaining: number; limit: number }
    | { mode: "demo"; questions: readonly string[] }
  ),
) {
  const { squad: base } = props;
  const key = storageKey(props.mode, base);
  const [value, setValue] = useState<PlateValue>("fixture");
  const [selected, setSelected] = useState<SquadPlayer | null>(null);
  const [highlights, setHighlights] = useState(new Map<number, { tone: HighlightTone; note: string }>());
  const [pendingLive, setPendingLive] = useState<string | null>(null);
  const [applied, setApplied] = useState<StoredPlan | null>(null);
  const [proposed, setProposed] = useState<PlanEvent | null>(null);

  useEffect(() => setApplied(loadPlan(key, base)), [key, base]);

  const onHighlight = useCallback((players: Highlight[]) => setHighlights(new Map(players.map((p) => [p.id, { tone: p.tone, note: p.note }]))), []);
  const onPlan = useCallback((e: PlanEvent) => setProposed(e), []);
  const clearLive = useCallback(() => setPendingLive(null), []);
  const noop = useCallback(() => {}, []);
  const close = useCallback(() => setSelected(null), []);

  // What the pitch shows: the co-pilot's proposal first, then the applied plan, then FPL as-is.
  const view = proposed ?? applied;
  const { shown, changes, marks } = useMemo(() => {
    if (!view) return { shown: base, changes: [] as string[], marks: new Map<number, string>() };
    const incoming = new Map(view.incoming.map((p) => [p.fplId, p]));
    const squad = applyPlan(base, view.plan, incoming);
    if (!squad) return { shown: base, changes: [] as string[], marks: new Map<number, string>() };
    return { shown: squad, changes: describePlan(base, view.plan, incoming), marks: planMarks(base, squad, view.plan) };
  }, [base, view]);

  const apply = () => {
    if (!proposed) return;
    const next = changes.length ? { plan: proposed.plan, incoming: proposed.incoming } : null;
    setApplied(next);
    savePlan(key, next);
    setProposed(null);
  };
  const revert = () => setProposed(null);
  const clearApplied = () => {
    setApplied(null);
    savePlan(key, null);
  };

  return (
    <div className="dugout">
      <section className="dugout-pitch" aria-label="Your squad">
        <div className="pitch-bar">
          <ScoreBug squad={shown} />
          <div className="seg" role="group" aria-label="Show under each player">
            <button type="button" className={value === "fixture" ? "on" : undefined} aria-pressed={value === "fixture"} onClick={() => setValue("fixture")}>
              Next fixture
            </button>
            <button type="button" className={value === "points" ? "on" : undefined} aria-pressed={value === "points"} onClick={() => setValue("points")}>
              GW{base.gameweek} points
            </button>
          </div>
        </div>

        {view && changes.length > 0 && (
          <div className={`plan-bar${proposed ? " proposed" : ""}`} role="region" aria-label={proposed ? "The Gaffer's changes" : "Your plan"}>
            <div className="plan-head">
              <span className="plan-plate">{proposed ? "Gaffer's plan" : "Your plan"}</span>
              <span className="plan-note">
                {proposed ? "Review it on the pitch" : "Not in FPL yet — make these changes in the FPL app"}
              </span>
            </div>
            <ul className="plan-changes">
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
              {view.plan.transfers.length > 0 && <li className="plan-bank">Bank after: £{shown.bankM.toFixed(1)}m (estimate)</li>}
            </ul>
            <div className="plan-actions">
              {proposed ? (
                <>
                  <button type="button" className="btn btn-accent" onClick={apply}>
                    Apply changes
                  </button>
                  <button type="button" className="btn" onClick={revert}>
                    Revert
                  </button>
                </>
              ) : (
                <>
                  <a className="btn" href="https://fantasy.premierleague.com/my-team" target="_blank" rel="noreferrer">
                    Open FPL ↗
                  </a>
                  <button type="button" className="text-btn" onClick={clearApplied}>
                    Clear plan
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <FplPitch squad={shown} value={value} highlights={highlights} marks={marks} onSelect={setSelected} />
        <div className="pitch-foot">
          {highlights.size > 0 ? (
            <button type="button" className="text-btn" onClick={() => setHighlights(new Map())}>
              Clear highlights
            </button>
          ) : (
            <span>Tap a player for their card</span>
          )}
          {base.missing.length > 0 && <span>{base.missing.length} new signing(s) not shown yet</span>}
        </div>
      </section>

      <div className="dugout-copilot">
        {props.mode === "live" ? (
          <Copilot
            mode="live"
            suggestions={props.suggestions}
            remaining={props.remaining}
            limit={props.limit}
            pending={pendingLive}
            onPendingConsumed={clearLive}
            onHighlight={onHighlight}
            onPlan={onPlan}
            appliedPlan={applied?.plan ?? null}
          />
        ) : (
          <Copilot mode="demo" questions={props.questions} pending={null} onPendingConsumed={noop} onHighlight={onHighlight} onPlan={onPlan} />
        )}
      </div>

      {selected &&
        (props.mode === "live" ? (
          <PlayerSheet
            player={selected}
            onClose={close}
            onAsk={(q) => {
              setSelected(null);
              setPendingLive(q);
            }}
          />
        ) : (
          <PlayerSheet player={selected} onClose={close} />
        ))}
    </div>
  );
}
