"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { kitImageUrl, normalizeName, type StatPosition, type StatRow } from "@fpl/shared";

/**
 * Search every player by name (accents and case ignored), filter by
 * position, best season points first. All in the browser from the list the
 * page loaded; typing never calls a server.
 */
const POSITIONS: { id: StatPosition | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "GKP", label: "GK" },
  { id: "DEF", label: "DEF" },
  { id: "MID", label: "MID" },
  { id: "FWD", label: "FWD" },
];

const LIMIT = 40;

export function PlayerSearch({ rows }: { rows: StatRow[] }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<StatPosition | null>(null);
  const indexed = useMemo(() => rows.map((r) => ({ r, key: normalizeName(`${r.webName} ${r.team}`) })), [rows]);
  const results = useMemo(() => {
    const q = normalizeName(query.trim());
    return indexed
      .filter(({ r, key }) => (!position || r.position === position) && (!q || key.includes(q)))
      .map(({ r }) => r)
      .sort((a, b) => b.totalPoints - a.totalPoints || a.webName.localeCompare(b.webName));
  }, [indexed, query, position]);

  return (
    <div className="ps">
      <div className="ps-bar">
        <label className="ps-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a player or club, e.g. Saka or MCI"
            aria-label="Search players"
            autoComplete="off"
          />
        </label>
        <div className="st-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p.label} type="button" className={position === p.id ? "is-on" : ""} aria-pressed={position === p.id} onClick={() => setPosition(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="ps-count" aria-live="polite">
        {results.length === 0 ? "No players match." : `${results.length} player${results.length === 1 ? "" : "s"}${results.length > LIMIT ? `, showing the top ${LIMIT} by points` : ""}`}
      </p>

      <ul className="ps-list">
        {results.slice(0, LIMIT).map((r) => (
          <li key={r.fplId}>
            <Link href={`/players/${r.fplId}`} className="ps-row">
              <img src={kitImageUrl(r.teamCode, r.position === "GKP", 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={30} height={40} />
              <span className="ps-name">
                <b>{r.webName}</b>
                <small>
                  {r.team} · {r.position}
                  {r.status !== "a" && <i className={`st-flag ${r.status === "d" ? "doubt" : "out"}`}>{r.status === "d" ? "doubt" : "out"}</i>}
                </small>
              </span>
              <span className="ps-stat">
                <small>Price</small>£{r.priceM.toFixed(1)}m
              </span>
              <span className="ps-stat">
                <small>Points</small>
                {r.totalPoints}
              </span>
              <span className="ps-stat hide-small">
                <small>Form</small>
                {r.form.toFixed(1)}
              </span>
              <span className="ps-stat hide-small">
                <small>Owned</small>
                {r.ownership.toFixed(1)}%
              </span>
              <span className="ps-go" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
