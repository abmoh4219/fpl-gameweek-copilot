"use client";

import { useMemo, useState } from "react";
import { kitImageUrl, sortGrid, type GridRow, type GridSort } from "@fpl/shared";

/**
 * The fixture grid with its sort. All twenty clubs arrive with the page;
 * sorting happens in the browser.
 */
const SORTS: { id: GridSort; label: string }[] = [
  { id: "next3", label: "Easiest next 3" },
  { id: "next5", label: "Easiest next 5" },
  { id: "name", label: "A–Z" },
];

export function FixturePlanner({ gameweeks, rows }: { gameweeks: number[]; rows: GridRow[] }) {
  const [sort, setSort] = useState<GridSort>("next3");
  const sorted = useMemo(() => sortGrid(rows, sort), [rows, sort]);
  const runKey = sort === "next5" ? "next5" : "next3";
  const bandKey = sort === "next5" ? "band5" : "band3";

  return (
    <div className="fx">
      <div className="fx-bar">
        <div className="st-seg" role="group" aria-label="Sort clubs">
          {SORTS.map((s) => (
            <button key={s.id} type="button" className={sort === s.id ? "is-on" : ""} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <ul className="fx-legend" aria-label="Difficulty key">
          {[1, 2, 3, 4, 5].map((d) => (
            <li key={d}>
              <i className={`fx-swatch d${d}`} />
              {d}
            </li>
          ))}
          <li>
            <b className="fx-cl">CL</b> after a Champions League game
          </li>
        </ul>
      </div>

      <div className="fx-card">
        <div className="fx-scroll">
          <table className="fx-table">
            <thead>
              <tr>
                <th scope="col" className="fx-team">Club</th>
                {gameweeks.map((gw) => (
                  <th scope="col" key={gw}>
                    GW{gw}
                  </th>
                ))}
                <th scope="col" className="fx-run">
                  Run <small>{sort === "next5" ? "next 5" : "next 3"}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.teamFplId}>
                  <th scope="row" className="fx-team">
                    <span className="fx-who">
                      <img src={kitImageUrl(r.teamCode, false, 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={24} height={32} />
                      {r.team}
                    </span>
                  </th>
                  {r.cells.map((c) => (
                    <td key={c.gameweek} className="fx-cell-wrap">
                      {c.fixtures.length === 0 ? (
                        <span className="fx-cell dx" title="Blank gameweek">
                          —
                        </span>
                      ) : (
                        <span className={`fx-stack${c.fixtures.length > 1 ? " is-double" : ""}`}>
                          {c.fixtures.map((f, i) => (
                            <span
                              key={`${f.opponent}-${i}`}
                              className={`fx-cell d${f.difficulty}`}
                              title={`${f.opponent} ${f.isHome ? "at home" : "away"} · difficulty ${f.difficulty}${f.afterCl ? " · soon after a Champions League game" : ""}`}
                            >
                              {f.isHome ? f.opponent : f.opponent.toLowerCase()}
                              {f.afterCl && <b className="fx-cl">CL</b>}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="fx-run">
                    <span className={`fx-band ${r[bandKey].toLowerCase()}`}>{r[bandKey]}</span>
                    <span className="mono">{r[runKey].toFixed(2)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="fx-note">
        Home fixtures in capitals, away in lower case. Two fixtures in a cell is a double gameweek; a dash is a blank.
        Congestion covers Champions League games only. Lower run scores are easier (estimate).
      </p>
    </div>
  );
}
