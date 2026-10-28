"use client";

import { useCallback, useState } from "react";
import type { HighlightTone, Squad, SquadPlayer } from "@fpl/shared";
import { Agent } from "./Agent";
import { Pitch, type View } from "./Pitch";
import { PlayerDrawer } from "./PlayerDrawer";

/**
 * Pitch and agent share one piece of state — the highlights — which is what
 * lets the agent point at players on the pitch while it answers.
 */
export function Workspace({ squad, initialQuestion }: { squad: Squad; initialQuestion: string | null }) {
  const [view, setView] = useState<View>("points");
  const [selected, setSelected] = useState<SquadPlayer | null>(null);
  const [highlights, setHighlights] = useState(new Map<number, { tone: HighlightTone; note: string }>());
  const [pending, setPending] = useState<string | null>(null);

  const onHighlight = useCallback(
    (players: { id: number; tone: HighlightTone; note: string }[]) =>
      setHighlights(new Map(players.map((p) => [p.id, { tone: p.tone, note: p.note }]))),
    [],
  );
  const clearPending = useCallback(() => setPending(null), []);

  return (
    <div className="workspace">
      <div className="pitch-col">
        <div className="pitch-toolbar">
          <div className="segmented" role="group" aria-label="Show on tiles">
            <button type="button" aria-pressed={view === "points"} onClick={() => setView("points")}>
              GW{squad.gameweek} points
            </button>
            <button type="button" aria-pressed={view === "fixtures"} onClick={() => setView("fixtures")}>
              Next fixture
            </button>
          </div>
          {highlights.size > 0 ? (
            <button type="button" className="chip" onClick={() => setHighlights(new Map())}>
              Clear highlights
            </button>
          ) : (
            <span className="faint mono" style={{ fontSize: 11 }}>
              tap a player for their card
            </span>
          )}
        </div>
        <Pitch squad={squad} view={view} highlights={highlights} onSelect={setSelected} />
        {squad.missing.length > 0 && (
          <p className="fineprint">
            {squad.missing.length} player(s) are too new to have a computed card yet and are not shown.
          </p>
        )}
      </div>

      <Agent
        teamId={squad.entryId}
        initialQuestion={initialQuestion}
        pendingQuestion={pending}
        onPendingConsumed={clearPending}
        onHighlight={onHighlight}
      />

      {selected && (
        <PlayerDrawer
          player={selected}
          onClose={() => setSelected(null)}
          onAsk={(q) => {
            setSelected(null);
            setPending(q);
          }}
        />
      )}
    </div>
  );
}
