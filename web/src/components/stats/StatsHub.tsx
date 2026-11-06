"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { INSIGHT_CONFIG, LEADERBOARDS, formatStat, kitImageUrl, leaderboard, type Leaderboard, type StatPosition, type StatRow } from "@fpl/shared";

/**
 * The stats hub: one leaderboard at a time. The six stats FPL managers check
 * most are one tap away; the rest sit in "More" (redesign: simple first).
 * Position and price filters. Everything is computed in the browser from the
 * one cached list the page already loaded; nothing here calls a server.
 */
const POSITIONS: { id: StatPosition | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "GKP", label: "GK" },
  { id: "DEF", label: "DEF" },
  { id: "MID", label: "MID" },
  { id: "FWD", label: "FWD" },
];

const PRICES = [null, 5, 6, 7, 8, 10] as const;

const GROUPS = ["Attack", "Expected", "FPL", "Defence", "Market"] as const;

/** One tap away; everything else is under "More". */
const PRIMARY = ["points", "goals", "assists", "xgi", "form", "value"] as const;
const SHORT: Record<string, string> = { value: "Value" };

function Kit({ r }: { r: StatRow }) {
  return <img className="st-kit" src={kitImageUrl(r.teamCode, r.position === "GKP", 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={28} height={37} />;
}

export function StatsHub({ rows }: { rows: StatRow[] }) {
  const [boardId, setBoardId] = useState("points");
  const [position, setPosition] = useState<StatPosition | null>(null);
  const [maxPriceM, setMaxPriceM] = useState<number | null>(null);

  const board: Leaderboard = LEADERBOARDS.find((b) => b.id === boardId) ?? LEADERBOARDS[0]!;
  const table = useMemo(() => leaderboard(rows, board, { position, maxPriceM }), [rows, board, position, maxPriceM]);
  const top = table[0] ? board.value(table[0]) : 0;
  const unavailable = board.positions && position && !board.positions.includes(position);

  return (
    <div className="st">
      <div className="st-rank-by">
        <div className="st-seg st-primary" role="group" aria-label="Rank by">
          {PRIMARY.map((id) => {
            const b = LEADERBOARDS.find((x) => x.id === id)!;
            return (
              <button key={id} type="button" className={b.id === board.id ? "is-on" : ""} aria-pressed={b.id === board.id} onClick={() => setBoardId(b.id)}>
                {SHORT[id] ?? b.label}
              </button>
            );
          })}
        </div>
        <label className={`st-price st-more${(PRIMARY as readonly string[]).includes(board.id) ? "" : " is-on"}`}>
          <span className="sr-only">More stats</span>
          <select value={(PRIMARY as readonly string[]).includes(board.id) ? "" : board.id} onChange={(e) => e.target.value && setBoardId(e.target.value)}>
            <option value="">More stats</option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {LEADERBOARDS.filter((b) => b.group === g && !(PRIMARY as readonly string[]).includes(b.id)).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="st-filters">
        <div className="st-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p.label} type="button" className={position === p.id ? "is-on" : ""} aria-pressed={position === p.id} onClick={() => setPosition(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="st-price">
          <span>Max price</span>
          <select value={maxPriceM ?? ""} onChange={(e) => setMaxPriceM(e.target.value === "" ? null : Number(e.target.value))}>
            {PRICES.map((p) => (
              <option key={p ?? "any"} value={p ?? ""}>
                {p === null ? "Any" : `£${p.toFixed(1)}m`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="st-card">
        <div className="st-head">
          <h2>{board.label}</h2>
          <p>
            {board.note}
            {board.per90 ? ` Players with at least ${INSIGHT_CONFIG.stats.minMinutesPer90} minutes.` : ""}
          </p>
        </div>

        {unavailable || table.length === 0 ? (
          <p className="st-empty">
            {unavailable ? `${board.label} is only ranked for ${board.positions!.join(" and ")}.` : "Nobody matches these filters."}
          </p>
        ) : (
          <div className="st-scroll">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col" className="st-rank">#</th>
                  <th scope="col" className="st-player">Player</th>
                  <th scope="col" className="st-main">{board.label}</th>
                  <th scope="col">Price</th>
                  <th scope="col">Mins</th>
                  <th scope="col">Pts</th>
                  <th scope="col">Owned</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => {
                  const v = board.value(r);
                  return (
                    <tr key={r.fplId}>
                      <td className="st-rank">{i + 1}</td>
                      <td className="st-player">
                        <div className="st-who">
                          <Kit r={r} />
                          <span>
                            <Link href={`/players/${r.fplId}`} className="st-link">
                              {r.webName}
                            </Link>
                            <small>
                              {r.team} · {r.position}
                              {r.status !== "a" && <i className={`st-flag ${r.status === "d" ? "doubt" : "out"}`}>{r.status === "d" ? "doubt" : "out"}</i>}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td className="st-main">
                        <span className="st-value">{formatStat(v, board.format)}</span>
                        <span className="st-bar" style={{ ["--w" as string]: `${top > 0 ? Math.max(4, (v / top) * 100) : 0}%` }} />
                      </td>
                      <td>£{r.priceM.toFixed(1)}m</td>
                      <td>{r.minutes.toLocaleString("en-GB")}</td>
                      <td>{r.totalPoints}</td>
                      <td>{r.ownership.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
