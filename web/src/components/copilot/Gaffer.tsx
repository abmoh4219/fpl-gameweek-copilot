"use client";

import { useEffect, useMemo, useState } from "react";
import { captainPlan, INSIGHT_CONFIG, transferPlan, TRANSFER_SORTS, type HighlightTone, type Squad, type SquadPlayer, type TeamPlan, type TransferSort } from "@fpl/shared";
import type { GafferData } from "@/lib/gaffer";
import "./gaffer.css";

export type Proposal = { plan: TeamPlan; incoming: SquadPlayer[] };
export type Highlight = { id: number; tone: HighlightTone; note: string };

const TOOLS = [
  ["best", "Best XI"],
  ["rate", "Rate my lineup"],
  ["captain", "Captain"],
  ["transfer", "Find a transfer"],
  ["injuries", "Injury check"],
] as const;
type Tool = (typeof TOOLS)[number][0];

const SORT_LABEL: Record<TransferSort, string> = { expected_points: "Expected points", form: "Last 4 GWs", fixtures: "Fixtures" };

const one = (n: number) => n.toFixed(1);

/**
 * The Gaffer: five squad checks computed by code (ADR-0016), no model and no
 * quota. Each check shows the numbers behind it; the ones that change the
 * team hand a plan to the dugout, which draws it on the pitch to apply or revert.
 */
export function Gaffer({
  squad,
  data,
  replace,
  onPlan,
  onHighlight,
}: {
  squad: Squad;
  data: GafferData;
  /** A player handed over from their card: open "Find a transfer" on them. */
  replace: { id: number; at: number } | null;
  onPlan: (p: Proposal) => void;
  onHighlight: (h: Highlight[]) => void;
}) {
  const [tool, setTool] = useState<Tool>("best");
  const [out, setOut] = useState<number | null>(() => data.injuries.find((f) => f.isStarter)?.fplId ?? null);
  const [sort, setSort] = useState<TransferSort>("expected_points");
  const gw = squad.gameweek + 1;

  useEffect(() => {
    if (!replace) return;
    setTool("transfer");
    setOut(replace.id);
  }, [replace]);

  // The injury check points at the flagged players on the pitch.
  useEffect(() => {
    if (tool !== "injuries") return onHighlight([]);
    onHighlight(data.injuries.map((f) => ({ id: f.fplId, tone: "watch" as const, note: f.chance === null ? f.status : `${f.chance}%` })));
  }, [tool, data.injuries, onHighlight]);

  const slot = useMemo(() => data.transfers.find((s) => s.out.fplId === out) ?? null, [data.transfers, out]);
  const lineup = data.lineup;
  const gain = lineup ? Math.round((lineup.pointsBest - lineup.pointsNow) * 10) / 10 : 0;
  const showBest = () => lineup && onPlan({ plan: lineup.best, incoming: [] });
  const owned = [...squad.starters, ...squad.bench].sort((a, b) => "GKPDEFMIDFWD".indexOf(a.position) - "GKPDEFMIDFWD".indexOf(b.position));

  return (
    <section className="copilot gf" aria-label="The Gaffer">
      <header className="copilot-head">
        <span className="on-air">Gaffer</span>
        <span className="copilot-left">Five checks for GW{gw}, every number shown</span>
      </header>

      <div className="gf-tabs" role="tablist" aria-label="Checks">
        {TOOLS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tool === id} className={tool === id ? "on" : undefined} onClick={() => setTool(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="gf-body" role="tabpanel">
        {tool === "best" &&
          (lineup ? (
            <>
              <h3 className="gf-title">The strongest XI your fifteen can field</h3>
              <div className="gf-figures">
                <div>
                  <span>Your XI</span>
                  <b>{one(lineup.pointsNow)}</b>
                </div>
                <div>
                  <span>Best XI</span>
                  <b>{one(lineup.pointsBest)}</b>
                </div>
                <div className={gain > 0 ? "up" : undefined}>
                  <span>Difference</span>
                  <b>{gain > 0 ? `+${one(gain)}` : "0.0"}</b>
                </div>
              </div>
              <p className="gf-unit">Expected points for GW{gw}, captain counted twice (estimate)</p>
              {gain > 0 || lineup.issues.length > 0 ? (
                <button type="button" className="btn btn-accent" onClick={showBest}>
                  Show it on the pitch
                </button>
              ) : (
                <p className="gf-ok">Your XI is already the strongest your fifteen can field.</p>
              )}
              <p className="gf-how">
                How it works: the eleven with the most FPL expected points in a legal formation, the bench ordered so the
                best non-starter comes on first, and the armband to the highest captain score. Anyone ruled out counts as zero.
              </p>
            </>
          ) : (
            <Missing />
          ))}

        {tool === "rate" &&
          (lineup ? (
            <>
              <div className="gf-rating">
                <b>{one(lineup.rating)}</b>
                <span>/ 10</span>
              </div>
              <p className="gf-unit">
                Your XI {one(lineup.pointsNow)} · best possible {one(lineup.pointsBest)} expected points (estimate)
              </p>
              {lineup.issues.length > 0 ? (
                <>
                  <ul className="gf-issues">
                    {lineup.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <button type="button" className="btn" onClick={showBest}>
                    Show the best XI
                  </button>
                </>
              ) : (
                <p className="gf-ok">Nothing to fix: this is the best XI your fifteen can field.</p>
              )}
              <p className="gf-how">
                How it works: 10 means your XI matches the best your fifteen can field on FPL&apos;s expected points. The
                score falls as the gap grows, and each issue names the players and the numbers behind it.
              </p>
            </>
          ) : (
            <Missing />
          ))}

        {tool === "captain" && (
          <>
            <h3 className="gf-title">Your starters by captain score</h3>
            <ol className="gf-list">
              {data.captains.slice(0, INSIGHT_CONFIG.gaffer.captainOptions).map((c) => (
                <li key={c.fplId} className={c.eligible ? undefined : "muted"}>
                  <div className="gf-row-main">
                    <b>
                      {c.webName}
                      {c.isCaptain && <i className="gf-badge">C</i>}
                      {c.isVice && <i className="gf-badge">V</i>}
                    </b>
                    <small>
                      {c.team} · {c.next ? `next ${c.next}` : "no fixture"}
                      {c.onPenalties ? " · on penalties" : ""}
                    </small>
                    <small className="gf-facts">
                      {c.reason ?? `${one(c.epNext)} xP · ${c.xgiPer90.toFixed(2)} xGI/90 · ${c.goalThreat.toLowerCase()} threat · ${c.minutesRisk.toLowerCase()} minutes risk`}
                    </small>
                  </div>
                  <span className="gf-score" title={c.eligible ? "Captain score (estimate)" : "Can't take the armband"}>
                    {c.eligible ? one(c.score) : "—"}
                  </span>
                  {c.eligible && !c.isCaptain ? (
                    <button type="button" className="gf-act" onClick={() => onPlan({ plan: captainPlan(squad, data.captains, c.fplId), incoming: [] })}>
                      Make captain
                    </button>
                  ) : (
                    <span className="gf-act-gap" />
                  )}
                </li>
              ))}
            </ol>
            <p className="gf-how">
              How it works: captain score is FPL&apos;s expected points, plus our goal-threat estimate, fixture ease and a
              home bonus. Players whose minutes are too uncertain are listed but can&apos;t take the armband. xP is expected
              points. An estimate, not a pick.
            </p>
          </>
        )}

        {tool === "transfer" && (
          <>
            <label className="gf-field">
              <span>Replace</span>
              <select value={out ?? ""} onChange={(e) => setOut(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choose a player</option>
                {owned.map((p) => (
                  <option key={p.fplId} value={p.fplId}>
                    {p.position} · {p.webName} · £{one(p.priceM)}m{p.status !== "a" ? " · flagged" : ""}
                  </option>
                ))}
              </select>
            </label>
            {slot ? (
              <>
                <div className="seg gf-sort" role="group" aria-label="Sort options by">
                  {TRANSFER_SORTS.map((s) => (
                    <button key={s} type="button" className={sort === s ? "on" : undefined} aria-pressed={sort === s} onClick={() => setSort(s)}>
                      {SORT_LABEL[s]}
                    </button>
                  ))}
                </div>
                <p className="gf-unit">
                  {slot.out.position}s up to £{one(slot.budgetM)}m: your £{one(squad.bankM)}m bank plus {slot.out.webName}&apos;s £
                  {one(slot.out.priceM)}m ({one(slot.out.epNext)} xP)
                </p>
                {slot.ideas[sort].length > 0 ? (
                  <ol className="gf-list">
                    {slot.ideas[sort].map((i) => (
                      <li key={i.fplId}>
                        <div className="gf-row-main">
                          <b>{i.webName}</b>
                          <small>
                            {i.team} · £{one(i.priceM)}m · {one(i.ownership)}% owned
                          </small>
                          <small className="gf-facts">
                            {one(i.epNext)} xP · {i.formPoints} pts last 4 · {i.xgiPer90.toFixed(2)} xGI/90 · {i.fixtureRun.toLowerCase()} run
                          </small>
                        </div>
                        <span className="gf-score" title="Bank after (estimate)">
                          £{one(i.bankAfterM)}m
                        </span>
                        <button
                          type="button"
                          className="gf-act"
                          onClick={() => {
                            const p = data.incoming[i.fplId];
                            if (p) onPlan({ plan: transferPlan(squad, slot.out.fplId, i.fplId), incoming: [p] });
                          }}
                        >
                          Try on pitch
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="gf-ok">No available {slot.out.position} fits £{one(slot.budgetM)}m and the 3-per-club rule.</p>
                )}
                <p className="gf-how">
                  Options, not advice: each list is sorted by one number, so check the others. Only available players with
                  minutes behind them are listed. Bank after uses today&apos;s selling price (an estimate), and each transfer
                  beyond your free ones costs 4 points.
                </p>
              </>
            ) : (
              <p className="gf-how">Pick a player to see legal like-for-like options within your budget.</p>
            )}
          </>
        )}

        {tool === "injuries" &&
          (data.injuries.length === 0 ? (
            <p className="gf-ok">Nobody in your fifteen has an FPL flag for GW{gw}.</p>
          ) : (
            <>
              <h3 className="gf-title">
                {data.injuries.length} flagged {data.injuries.length === 1 ? "player" : "players"}, marked on the pitch
              </h3>
              <ul className="gf-list gf-flags">
                {data.injuries.map((f) => (
                  <li key={f.fplId}>
                    <div className="gf-row-main">
                      <b>
                        {f.webName} <small>{f.team}</small>
                      </b>
                      {f.news && <small>{f.news}</small>}
                      <small className="gf-facts">
                        {f.isStarter
                          ? f.cover
                            ? `Starting · bench cover: ${f.cover.webName} (${one(f.cover.epNext)} xP)`
                            : "Starting · nobody on your bench can come on in a legal formation"
                          : "On your bench"}
                      </small>
                    </div>
                    <span className={`gf-flag${f.chance !== null && f.chance >= 50 ? " doubt" : ""}`}>{f.chance === null ? f.status : `${f.chance}%`}</span>
                    {f.isStarter ? (
                      <button type="button" className="gf-act" onClick={() => {
                          setOut(f.fplId);
                          setTool("transfer");
                        }}>
                        Find a replacement
                      </button>
                    ) : (
                      <span className="gf-act-gap" />
                    )}
                  </li>
                ))}
              </ul>
              <p className="gf-how">Status, chance of playing and news come straight from FPL. Bench cover follows your bench order.</p>
            </>
          ))}
      </div>
    </section>
  );
}

function Missing() {
  return <p className="gf-ok">One of your players has no card yet (a brand-new signing), so this check is skipped until the next update.</p>;
}
