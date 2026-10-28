"use client";

import { useCallback, useState } from "react";
import type { HighlightTone, Squad, SquadPlayer } from "@fpl/shared";
import { FplPitch, type PlateValue } from "../pitch/FplPitch";
import { ScoreBug } from "../pitch/ScoreBug";
import { Copilot, type Highlight } from "./Copilot";
import { PlayerSheet } from "./PlayerSheet";
import "./copilot.css";

/**
 * The pitch and the co-pilot side by side. They share one piece of state, the
 * highlights, which is what lets the co-pilot point at players while it
 * answers. Tapping a player opens their card.
 */
export function Dugout(
  props: { squad: Squad } & (
    | { mode: "live"; suggestions: readonly string[]; remaining: number; limit: number }
    | { mode: "demo"; questions: readonly string[] }
  ),
) {
  const { squad } = props;
  const [value, setValue] = useState<PlateValue>("fixture");
  const [selected, setSelected] = useState<SquadPlayer | null>(null);
  const [highlights, setHighlights] = useState(new Map<number, { tone: HighlightTone; note: string }>());
  const [pendingLive, setPendingLive] = useState<string | null>(null);

  const onHighlight = useCallback((players: Highlight[]) => setHighlights(new Map(players.map((p) => [p.id, { tone: p.tone, note: p.note }]))), []);
  const clearLive = useCallback(() => setPendingLive(null), []);
  const noop = useCallback(() => {}, []);
  const close = useCallback(() => setSelected(null), []);

  return (
    <div className="dugout">
      <section className="dugout-pitch" aria-label="Your squad">
        <div className="pitch-bar">
          <ScoreBug squad={squad} />
          <div className="seg" role="group" aria-label="Show under each player">
            <button type="button" className={value === "fixture" ? "on" : undefined} aria-pressed={value === "fixture"} onClick={() => setValue("fixture")}>
              Next fixture
            </button>
            <button type="button" className={value === "points" ? "on" : undefined} aria-pressed={value === "points"} onClick={() => setValue("points")}>
              GW{squad.gameweek} points
            </button>
          </div>
        </div>
        <FplPitch squad={squad} value={value} highlights={highlights} onSelect={setSelected} />
        <div className="pitch-foot">
          {highlights.size > 0 ? (
            <button type="button" className="text-btn" onClick={() => setHighlights(new Map())}>
              Clear highlights
            </button>
          ) : (
            <span>Tap a player for their card</span>
          )}
          {squad.missing.length > 0 && <span>{squad.missing.length} new signing(s) not shown yet</span>}
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
          />
        ) : (
          <Copilot mode="demo" questions={props.questions} pending={null} onPendingConsumed={noop} onHighlight={onHighlight} />
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
