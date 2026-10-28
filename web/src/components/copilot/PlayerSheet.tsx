"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { kitImageUrl, type SquadPlayer } from "@fpl/shared";

const STATUS: Record<string, string> = {
  a: "Available",
  d: "Doubtful",
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
  n: "Not in squad",
};

/** A player's card, sliding in from the side. Every number was computed by our pipeline. */
export function PlayerSheet({
  player: p,
  onClose,
  onAsk,
}: {
  player: SquadPlayer;
  onClose: () => void;
  /** Live: ask the co-pilot. Demo: undefined, and the card invites a sign-up. */
  onAsk?: (question: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fine = p.status === "a";
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`${p.webName} player card`}>
        <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label="Close player card">
          ✕
        </button>
        <header className="sheet-head">
          <img src={kitImageUrl(p.teamCode, p.position === "GKP", 220)} alt="" width={110} height={110} referrerPolicy="no-referrer" />
          <div>
            <div className="sheet-meta">
              {p.team} · {p.position} · £{p.priceM.toFixed(1)}m
            </div>
            <h2 className="sheet-name">{p.webName}</h2>
            <div className="sheet-tags">
              <span className={`chance ${fine ? "a" : p.status === "d" ? "d" : "x"}`}>
                {fine ? STATUS["a"] : p.status === "d" ? `${p.chanceOfPlayingNextRound ?? 50}%` : (STATUS[p.status] ?? "Out")}
              </span>
              {p.isCaptain && <span className="sheet-tag">Captain</span>}
              {p.isViceCaptain && <span className="sheet-tag">Vice-captain</span>}
              {!p.isStarter && <span className="sheet-tag">Bench</span>}
            </div>
          </div>
        </header>

        {p.news && <p className="sheet-news">{p.news}</p>}

        <dl className="sheet-stats">
          <div>
            <dt>Season points</dt>
            <dd>{p.seasonPoints}</dd>
          </div>
          <div>
            <dt>GW points</dt>
            <dd>
              {p.pickPoints}
              {p.multiplier > 1 && <small> ({p.eventPoints}×{p.multiplier})</small>}
            </dd>
          </div>
          <div>
            <dt>Last 4 GWs</dt>
            <dd>{p.formPoints}</dd>
          </div>
          <div>
            <dt>xGI per 90</dt>
            <dd>{p.xgiPer90.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Minutes risk</dt>
            <dd>{p.minutesRisk}</dd>
          </div>
          <div>
            <dt>
              Goal threat <span className="est-dot" title="Estimate" />
            </dt>
            <dd>{p.goalThreat}</dd>
          </div>
        </dl>
        <p className="sheet-owned">Owned by {p.ownership.toFixed(1)}% of managers</p>

        <div className="sheet-section">
          Next five · <b>{p.fixtureBand}</b> run <span className="est">estimate</span>
        </div>
        <ol className="sheet-fixtures">
          {p.fixtures.slice(0, 5).map((f) => (
            <li key={`${f.gameweek}-${f.opponent ?? "blank"}`} className={`fdr-cell d${f.isBlank ? "x" : (f.difficulty ?? 3)}`}>
              <b>{f.isBlank ? "—" : f.opponent}</b>
              <small>
                GW{f.gameweek} {f.isBlank ? "blank" : f.isHome ? "home" : "away"}
                {f.isDouble ? " ×2" : ""}
              </small>
            </li>
          ))}
        </ol>

        <div className="sheet-actions">
          {onAsk ? (
            <button
              type="button"
              className="btn btn-accent btn-block"
              onClick={() => onAsk(`Should I keep ${p.webName}, or is there a better ${p.position} for my budget?`)}
            >
              Ask the Gaffer about {p.webName}
            </button>
          ) : (
            <Link href="/sign-up" className="btn btn-accent btn-block">
              Ask about your own players — free
            </Link>
          )}
          <p className="hint">Minutes risk, goal threat and fixture runs are computed by our pipeline. Anything about the future is an estimate.</p>
        </div>
      </aside>
    </>
  );
}
