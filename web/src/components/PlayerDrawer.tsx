"use client";

import { useEffect } from "react";
import type { SquadPlayer } from "@fpl/shared";
import { Shirt } from "./Shirt";

const STATUS: Record<string, string> = {
  a: "Available",
  d: "Doubtful",
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
  n: "Not in squad",
};

export function PlayerDrawer({
  player,
  onClose,
  onAsk,
}: {
  player: SquadPlayer;
  onClose: () => void;
  onAsk: (question: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = player;
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${p.webName} card`}>
        <div className="drawer-head">
          <div className="shirt">
            <Shirt kit={p.kit} label={p.position === "GKP" ? "GK" : p.team} id={`d-${p.fplId}`} />
          </div>
          <div>
            <div className="mono faint" style={{ fontSize: 11 }}>
              {p.team} · {p.position} · £{p.priceM.toFixed(1)}m
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{p.webName}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span className={`tag ${p.status === "a" ? "tag-accent" : "tag-warn"}`}>{STATUS[p.status] ?? p.status}</span>
              {p.isCaptain && <span className="tag">Captain</span>}
              {p.isViceCaptain && <span className="tag">Vice</span>}
              {!p.isStarter && <span className="tag">Bench</span>}
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {p.news && <div className="news">{p.news}</div>}

        <div className="kv">
          <div>
            <div className="k">GW points</div>
            <div className="v">
              {p.pickPoints}
              {p.multiplier > 1 ? <span className="faint"> ({p.eventPoints}×{p.multiplier})</span> : null}
            </div>
          </div>
          <div>
            <div className="k">Last 4 GW</div>
            <div className="v">{p.formPoints} pts</div>
          </div>
          <div>
            <div className="k">xGI / 90</div>
            <div className="v">{p.xgiPer90.toFixed(2)}</div>
          </div>
          <div>
            <div className="k">Minutes risk</div>
            <div className="v">{p.minutesRisk}</div>
          </div>
          <div>
            <div className="k">Goal threat</div>
            <div className="v">
              {p.goalThreat} <span className="faint" style={{ fontSize: 11 }}>est.</span>
            </div>
          </div>
          <div>
            <div className="k">Owned by</div>
            <div className="v">{p.ownership.toFixed(1)}%</div>
          </div>
        </div>

        <div className="section-label" style={{ margin: "22px 0 0" }}>
          next 5 · <b>{p.fixtureBand}</b> run
        </div>
        <div className="fixtures-strip">
          {p.fixtures.slice(0, 5).map((f) => (
            <div key={`${f.gameweek}-${f.opponent}`} className={`fx fdr-${f.isBlank ? 3 : (f.difficulty ?? 3)}`}>
              {f.isBlank ? "—" : f.opponent}
              <small>
                GW{f.gameweek}
                {f.isBlank ? " blank" : f.isHome ? " H" : " A"}
              </small>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 22 }}>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => onAsk(`Should I keep ${p.webName}, or is there a better ${p.position} for my budget?`)}
          >
            Ask the agent about {p.webName} →
          </button>
          <p className="fineprint" style={{ margin: 0 }}>
            Minutes risk, goal threat and fixture runs are computed by our pipeline. Forward-looking values are
            estimates.
          </p>
        </div>
      </aside>
    </>
  );
}
