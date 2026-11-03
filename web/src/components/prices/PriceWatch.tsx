"use client";

import { useMemo, useState } from "react";
import { closestToChange, kitImageUrl, type StatPosition, type WatchRow } from "@fpl/shared";

/**
 * Tonight's watch: the players closest to a rise or a fall, with how far along
 * they are and FPL's own projection strength. All estimates.
 */
const POSITIONS: { id: StatPosition | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "GKP", label: "GK" },
  { id: "DEF", label: "DEF" },
  { id: "MID", label: "MID" },
  { id: "FWD", label: "FWD" },
];

export function PriceWatch({ rows, codes }: { rows: WatchRow[]; codes: Record<string, number> }) {
  const [direction, setDirection] = useState<"rising" | "falling">("rising");
  const [position, setPosition] = useState<StatPosition | null>(null);
  const list = useMemo(() => closestToChange(rows, direction, position), [rows, direction, position]);
  const up = direction === "rising";

  return (
    <div className="pw">
      <div className="pw-bar">
        <div className="st-seg" role="group" aria-label="Direction">
          <button type="button" className={up ? "is-on" : ""} aria-pressed={up} onClick={() => setDirection("rising")}>
            Likely risers
          </button>
          <button type="button" className={!up ? "is-on" : ""} aria-pressed={!up} onClick={() => setDirection("falling")}>
            Likely fallers
          </button>
        </div>
        <div className="st-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p.label} type="button" className={position === p.id ? "is-on" : ""} aria-pressed={position === p.id} onClick={() => setPosition(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pw-card">
        <div className="pw-head">
          <span>Player</span>
          <span>Progress to a {up ? "rise" : "fall"} (estimate)</span>
          <span>FPL signal</span>
        </div>
        {list.length === 0 && <p className="pw-empty pad">Nobody is close to a {up ? "rise" : "fall"} right now.</p>}
        {list.map((r) => {
          const code = codes[r.team];
          const pct = Math.min(100, Math.abs(r.percent));
          return (
            <div className="pw-row" key={r.fplId}>
              <span className="pw-who">
                {code ? <img src={kitImageUrl(code, r.position === "GKP", 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={24} height={32} /> : <span />}
                <span>
                  <b>{r.webName}</b>
                  <small>
                    {r.team} · {r.position} · £{r.priceM.toFixed(1)}m
                    {r.locked && (
                      <i className="pw-lock" title="FPL has locked this player's price for now (usually right after a change)">
                        locked
                      </i>
                    )}
                  </small>
                </span>
              </span>
              <span className="pw-progress">
                <span className={`pw-track ${up ? "up" : "down"}`} aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="mono">
                  {Math.abs(r.percent).toFixed(1)}%
                  {r.overThreshold && <em title="FPL has not changed the price yet. Crossing 100% is not a confirmed change."> past 100%, not confirmed</em>}
                </span>
              </span>
              <span className="pw-signal" title={`FPL's projection strength: ${r.strength} of 5 (estimate)`} aria-label={`FPL signal ${r.strength} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} className={n <= r.strength ? `on ${up ? "up" : "down"}` : ""} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <p className="pw-note">
        Progress and signal come from FPL&apos;s own price-change data. How FPL uses them isn&apos;t documented, so treat
        both as estimates: a player can pass 100% and still not move.
      </p>
    </div>
  );
}
