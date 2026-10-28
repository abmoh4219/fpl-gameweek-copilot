"use client";

import type { HighlightTone, Squad, SquadPlayer } from "@fpl/shared";
import { Shirt } from "./Shirt";

export type View = "points" | "fixtures";
export type Highlights = ReadonlyMap<number, { tone: HighlightTone; note: string }>;

const ROWS = ["GKP", "DEF", "MID", "FWD"] as const;

function flag(p: SquadPlayer): { cls: "d" | "x"; label: string } | null {
  if (p.status === "a") return null;
  if (p.status === "d") return { cls: "d", label: `${p.chanceOfPlayingNextRound ?? 50}% chance` };
  return { cls: "x", label: p.status === "s" ? "suspended" : p.status === "i" ? "injured" : "unavailable" };
}

function PlayerTile({
  p,
  view,
  highlight,
  onSelect,
}: {
  p: SquadPlayer;
  view: View;
  highlight: { tone: HighlightTone; note: string } | undefined;
  onSelect: (p: SquadPlayer) => void;
}) {
  const f = flag(p);
  const next = p.fixtures[0];
  const fdr = next?.difficulty ?? 3;

  return (
    <button
      type="button"
      className={`player${p.isStarter ? "" : " is-bench"}`}
      data-tone={highlight?.tone}
      onClick={() => onSelect(p)}
      aria-label={`${p.webName}, ${p.team} ${p.position}, ${p.pickPoints} points. Open card.`}
    >
      <div className="shirt">
        <Shirt kit={p.kit} label={p.position === "GKP" ? "GK" : p.team} id={String(p.fplId)} />
        {p.isCaptain && <span className="badge badge-c">C</span>}
        {p.isViceCaptain && <span className="badge badge-v">V</span>}
        {f && (
          <span className={`badge badge-flag ${f.cls}`} title={f.label}>
            !
          </span>
        )}
      </div>
      <div className="plate">
        <div className="plate-name">{p.webName}</div>
        {view === "points" ? (
          <div className="plate-val">{p.isStarter ? p.pickPoints : p.eventPoints}</div>
        ) : next && !next.isBlank ? (
          <div className={`plate-val fdr fdr-${fdr}`}>
            {next.opponent} ({next.isHome ? "H" : "A"})
          </div>
        ) : (
          <div className="plate-val">blank</div>
        )}
      </div>
      {highlight && (
        <span
          className="player-note"
          style={{
            color:
              highlight.tone === "sell" ? "var(--danger)" : highlight.tone === "watch" ? "var(--warn)" : "var(--accent)",
          }}
        >
          {highlight.note || highlight.tone}
        </span>
      )}
    </button>
  );
}

export function Pitch({
  squad,
  view,
  highlights,
  onSelect,
}: {
  squad: Squad;
  view: View;
  highlights: Highlights;
  onSelect: (p: SquadPlayer) => void;
}) {
  return (
    <div>
      <div className="pitch">
        <svg className="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="var(--pitch-line)" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
            <rect x="3" y="3" width="94" height="134" />
            <line x1="3" y1="137" x2="97" y2="137" />
            <rect x="25" y="3" width="50" height="20" />
            <rect x="38" y="3" width="24" height="8" />
            <path d="M40 23 Q50 30 60 23" />
            <circle cx="50" cy="137" r="14" />
          </g>
        </svg>
        {ROWS.map((pos) => (
          <div className="pitch-row" key={pos}>
            {squad.starters
              .filter((p) => p.position === pos)
              .map((p) => (
                <PlayerTile key={p.fplId} p={p} view={view} highlight={highlights.get(p.fplId)} onSelect={onSelect} />
              ))}
          </div>
        ))}
      </div>

      <div className="bench-label">
        <span>Bench</span>
        <span>in order</span>
      </div>
      <div className="bench">
        {squad.bench.map((p) => (
          <PlayerTile key={p.fplId} p={p} view={view} highlight={highlights.get(p.fplId)} onSelect={onSelect} />
        ))}
      </div>

      <div className="legend" aria-label="Fixture difficulty">
        <span>Fixture difficulty</span>
        {[1, 2, 3, 4, 5].map((d) => (
          <span key={d}>
            <i className={`fdr-${d}`} />
            {d}
          </span>
        ))}
        <span>
          <span className="badge badge-flag d">!</span> doubtful
        </span>
        <span>
          <span className="badge badge-flag x">!</span> out
        </span>
      </div>
    </div>
  );
}
