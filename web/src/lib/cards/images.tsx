import type { CompareLine, FixtureSwing, GameweekWrapped, GridRow, LeagueCount, LeagueSpy, StatRow, TemplateXi, TransferRadar, WatchRow } from "@fpl/shared";
import { C, CardFrame, FdrChips, Shirt, compact, type FixtureChip } from "./frame";

/** The shareable cards, drawn for next/og (ADR-0019). Pure: data in, picture out. */

function Empty({ text }: { text: string }) {
  return <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 30, color: C.muted }}>{text}</div>;
}

// ------------------------------------------------------------ transfers --

function RadarColumn({ title, rows, tone, fixtures }: { title: string; rows: StatRow[]; tone: "in" | "out"; fixtures: Record<number, FixtureChip[]> }) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.netTransfers)));
  const colour = tone === "in" ? C.up : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, fontSize: 16, color: C.muted }}>
        <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: colour }} />
        {title}
      </div>
      {rows.map((r) => (
        <div key={r.fplId} style={{ display: "flex", alignItems: "center", gap: 10, height: 47, borderBottom: `1px solid ${C.line}` }}>
          <Shirt teamCode={r.teamCode} position={r.position} size={28} />
          <div style={{ display: "flex", flexDirection: "column", width: 170 }}>
            <div style={{ display: "flex", fontSize: 18 }}>{r.webName}</div>
            <div style={{ display: "flex", fontSize: 13, color: C.faint }}>
              {r.team} · {r.position} · £{r.priceM.toFixed(1)}m · {r.ownership.toFixed(1)}%
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 46 }}>
            <div style={{ display: "flex", fontSize: 11, color: C.faint }}>form</div>
            <div style={{ display: "flex", fontSize: 15 }}>{r.form.toFixed(1)}</div>
          </div>
          <FdrChips fixtures={fixtures[r.fplId] ?? []} width={34} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: 1 }}>
            <div style={{ display: "flex", fontSize: 18, color: colour }}>{compact(r.netTransfers, true)}</div>
            <div style={{ display: "flex", width: 70, height: 3, borderRadius: 2, background: C.raised, justifyContent: "flex-end" }}>
              <div style={{ display: "flex", width: `${Math.max(6, (Math.abs(r.netTransfers) / top) * 100)}%`, height: 3, borderRadius: 2, background: colour }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransferRadarCard({ radar, gameweek, date, fixtures }: { radar: TransferRadar; gameweek: number | null; date: string; fixtures: Record<number, FixtureChip[]> }) {
  return (
    <CardFrame kicker={`${gameweek ? `Gameweek ${gameweek} · ` : ""}net transfers${date ? ` to ${date}` : ""} · next three fixtures`} title="The transfer radar">
      {radar.in.length + radar.out.length === 0 ? (
        <Empty text="No transfers counted yet this gameweek" />
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 32 }}>
          <RadarColumn title="Most transferred in" rows={radar.in} tone="in" fixtures={fixtures} />
          <RadarColumn title="Most transferred out" rows={radar.out} tone="out" fixtures={fixtures} />
        </div>
      )}
    </CardFrame>
  );
}

// ---------------------------------------------------------- template XI --

function PitchPlayer({ p, label }: { p: StatRow; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: 220 }}>
      <Shirt teamCode={p.teamCode} position={p.position} size={32} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", padding: "1px 8px", borderRadius: 6, background: "rgba(14,14,16,0.82)", fontSize: 16 }}>{p.webName}</div>
        <div style={{ display: "flex", marginTop: 2, paddingLeft: 8, fontSize: 13, color: C.accent }}>{label}</div>
      </div>
    </div>
  );
}

/** An XI on a pitch laid on its side (our goal left, attacking right), one label under each name. */
function PitchCard({ xi, kicker, title, label, empty }: { xi: TemplateXi | null; kicker: string; title: string; label: (p: StatRow) => string; empty: string }) {
  if (!xi) return <CardFrame kicker={kicker} title={title}><Empty text={empty} /></CardFrame>;
  const lines = (["GKP", "DEF", "MID", "FWD"] as const).map((pos) => xi.players.filter((p) => p.position === pos));
  return (
    <CardFrame kicker={kicker} title={title}>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 12px",
          borderRadius: 16,
          border: "2px solid rgba(255,255,255,0.55)",
          backgroundImage: `repeating-linear-gradient(90deg, ${C.grass} 0px, ${C.grass} 90px, ${C.grass2} 90px, ${C.grass2} 180px)`,
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", height: "100%", padding: "8px 0" }}>
            {line.map((p) => (
              <PitchPlayer key={p.fplId} p={p} label={label(p)} />
            ))}
          </div>
        ))}
      </div>
    </CardFrame>
  );
}

export function TemplateXiCard({ xi, gameweek }: { xi: TemplateXi | null; gameweek: number | null }) {
  const avg = xi ? xi.players.reduce((s, p) => s + p.ownership, 0) / xi.players.length : 0;
  return (
    <PitchCard
      xi={xi}
      kicker={`${gameweek ? `Gameweek ${gameweek} · ` : ""}${xi ? `${xi.formation} · average ownership ${avg.toFixed(1)}%` : "Most-owned XI"}`}
      title="The template XI"
      label={(p) => `${p.ownership.toFixed(1)}% · £${p.priceM.toFixed(1)}m`}
      empty="Ownership isn't available right now"
    />
  );
}

export function BestXiCard({ xi, gameweek, finished, points }: { xi: TemplateXi | null; gameweek: number; finished: boolean; points: ReadonlyMap<number, number> }) {
  const total = xi ? xi.players.reduce((s, p) => s + (points.get(p.fplId) ?? 0), 0) : 0;
  return (
    <PitchCard
      xi={xi}
      kicker={`${xi ? `${xi.formation} · ${total} points between them` : "Highest-scoring XI"}${finished ? "" : " · live, points so far"}`}
      title={`Gameweek ${gameweek}'s best XI`}
      label={(p) => `${points.get(p.fplId) ?? 0} pts · ${p.ownership.toFixed(1)}% owned`}
      empty="No points in yet for this gameweek"
    />
  );
}

// -------------------------------------------------------------- swings --

function SwingColumn({ title, swings, rows, tone }: { title: string; swings: FixtureSwing[]; rows: ReadonlyMap<number, GridRow>; tone: "easier" | "harder" }) {
  const colour = tone === "easier" ? C.up : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, fontSize: 16, color: C.muted }}>
        <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: colour }} />
        {title}
      </div>
      {swings.map((s) => {
        const row = rows.get(s.teamFplId);
        const chips: FixtureChip[] = (row?.cells ?? []).map((c, i) => {
          const f = c.fixtures[0];
          return { gameweek: s.gameweeks[i] ?? i, label: f ? (f.isHome ? f.opponent : f.opponent.toLowerCase()) : "–", difficulty: s.difficulty[i] === null ? null : Math.round(s.difficulty[i]!) };
        });
        return (
          <div key={s.teamFplId} style={{ display: "flex", alignItems: "center", gap: 12, height: 62, borderBottom: `1px solid ${C.line}` }}>
            <Shirt teamCode={s.teamCode} position="MID" size={30} />
            <div style={{ display: "flex", width: 56, fontSize: 19 }}>{s.team}</div>
            <FdrChips fixtures={chips} width={40} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1 }}>
              <div style={{ display: "flex", fontSize: 16, color: C.text }}>
                {s.early?.toFixed(1) ?? "–"} → <span style={{ display: "flex", marginLeft: 6, color: colour }}>{s.late?.toFixed(1) ?? "–"}</span>
              </div>
              <div style={{ display: "flex", fontSize: 12, color: C.faint }}>5-game avg {s.overall?.toFixed(1) ?? "–"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FixtureSwingsCard({ easier, harder, rows, from }: { easier: FixtureSwing[]; harder: FixtureSwing[]; rows: ReadonlyMap<number, GridRow>; from: number | null }) {
  return (
    <CardFrame
      kicker={`FPL difficulty, next two gameweeks → the three after${from ? ` (from GW${from})` : ""} · lower is easier`}
      title="Fixture swings"
      note="FPL's own difficulty rating, which ignores form · an estimate"
    >
      {easier.length + harder.length === 0 ? (
        <Empty text="No big swings in the next five gameweeks" />
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 32 }}>
          <SwingColumn title="Gets easier" swings={easier} rows={rows} tone="easier" />
          <SwingColumn title="Gets harder" swings={harder} rows={rows} tone="harder" />
        </div>
      )}
    </CardFrame>
  );
}

// ------------------------------------------------------------ prices --

function Signal({ strength, colour }: { strength: number; colour: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} style={{ display: "flex", width: 6, height: 6, borderRadius: 3, background: n <= strength ? colour : C.raised }} />
      ))}
    </div>
  );
}

function PriceColumn({ title, rows, tone }: { title: string; rows: WatchRow[]; tone: "rise" | "fall" }) {
  const colour = tone === "rise" ? C.up : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, fontSize: 16, color: C.muted }}>
        <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: colour }} />
        {title}
      </div>
      {rows.map((r) => {
        const pct = Math.abs(r.percent);
        return (
          <div key={r.fplId} style={{ display: "flex", alignItems: "center", gap: 12, height: 47, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", flexDirection: "column", width: 190 }}>
              <div style={{ display: "flex", fontSize: 18 }}>{r.webName}</div>
              <div style={{ display: "flex", fontSize: 13, color: C.faint }}>
                {r.team} · {r.position} · £{r.priceM.toFixed(1)}m{r.locked ? " · locked" : ""}
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, height: 6, borderRadius: 3, background: C.raised }}>
              <div style={{ display: "flex", width: `${Math.min(100, pct)}%`, height: 6, borderRadius: 3, background: colour }} />
            </div>
            <div style={{ display: "flex", width: 56, justifyContent: "flex-end", fontSize: 17 }}>{pct >= 100 ? "100%+" : `${Math.round(pct)}%`}</div>
            <Signal strength={r.strength} colour={colour} />
          </div>
        );
      })}
    </div>
  );
}

export function PricesTonightCard({ rising, falling, date }: { rising: WatchRow[]; falling: WatchRow[]; date: string }) {
  return (
    <CardFrame
      kicker={`Progress toward a price change${date ? ` · ${date}` : ""} · dots are FPL's own signal · an estimate`}
      title="Tonight's price watch"
      note="FPL's own price data · past 100% is not a confirmed change"
    >
      {rising.length + falling.length === 0 ? (
        <Empty text="Nobody is close to a price change tonight" />
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 32 }}>
          <PriceColumn title="Closest to a rise" rows={rising} tone="rise" />
          <PriceColumn title="Closest to a fall" rows={falling} tone="fall" />
        </div>
      )}
    </CardFrame>
  );
}

// ------------------------------------------------------------- wrapped --

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string | undefined; tone?: "up" | "down" | "accent" | undefined }) {
  const colour = tone === "up" ? C.up : tone === "down" ? C.down : tone === "accent" ? C.accent : C.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 214, height: 112, padding: "0 16px", borderRadius: 12, background: C.panel }}>
      <div style={{ display: "flex", fontSize: 14, color: C.muted }}>{label}</div>
      <div style={{ display: "flex", marginTop: 4, fontSize: 23, color: colour }}>{value}</div>
      {sub && <div style={{ display: "flex", marginTop: 2, fontSize: 13, color: C.faint }}>{sub}</div>}
    </div>
  );
}

export function WrappedCard({ w, team, finished, total }: { w: GameweekWrapped; team: string; finished: boolean; total: number }) {
  const diff = w.average !== null ? w.net - w.average : null;
  const rank = w.overallRank !== null ? w.overallRank.toLocaleString("en-GB") : "—";
  return (
    <CardFrame kicker={`${team}${w.chip ? ` · ${w.chip}` : ""}${finished ? "" : " · live, points so far"}`} title={`Gameweek ${w.gameweek}, wrapped`}>
      <div style={{ display: "flex", flex: 1, gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 360 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ display: "flex", fontSize: 112, lineHeight: 1, letterSpacing: -4, color: C.accent }}>{w.net}</div>
            <div style={{ display: "flex", fontSize: 22, color: C.muted }}>points{w.hits > 0 ? ` (−${w.hits} hit)` : ""}</div>
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 20, color: C.muted }}>
            {w.average !== null ? (
              <>
                Average {w.average} ·
                <span style={{ display: "flex", marginLeft: 6, color: diff! >= 0 ? C.up : C.down }}>{diff! >= 0 ? `+${diff} above` : `${Math.abs(diff!)} below`}</span>
              </>
            ) : (
              "Average not out yet"
            )}
          </div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 20, color: C.muted }}>
            Overall rank {rank}
            {w.rankMove !== null && w.rankMove !== 0 && (
              <span style={{ display: "flex", marginLeft: 8, color: w.rankMove > 0 ? C.up : C.down }}>
                {w.rankMove > 0 ? "▲" : "▼"} {Math.abs(w.rankMove).toLocaleString("en-GB")}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: 1, alignContent: "center" }}>
          <Tile label="Captain" value={w.captain?.name ?? "—"} sub={w.captain ? `${w.captain.points} pts with the armband` : undefined} />
          <Tile
            label="Best captain in your XI"
            value={w.bestCaptain ? (w.bestCaptain.isYours ? "You picked it" : w.bestCaptain.name) : "—"}
            sub={w.bestCaptain ? `${w.bestCaptain.points} pts with the armband` : undefined}
            tone={w.bestCaptain?.isYours ? "up" : undefined}
          />
          <Tile label="Top scorer in your XI" value={w.topScorer?.name ?? "—"} sub={w.topScorer ? `${w.topScorer.points} pts` : undefined} />
          <Tile label="Left on the bench" value={`${w.benchPoints} pts`} tone={w.benchPoints >= 10 ? "down" : undefined} />
          <Tile label="Transfers" value={w.transfers === 0 ? "None" : `${w.transfers} made`} sub={w.hits > 0 ? `−${w.hits} pts in hits` : "No hits"} tone={w.hits > 0 ? "down" : undefined} />
          <Tile label="Season total" value={`${total} pts`} />
        </div>
      </div>
    </CardFrame>
  );
}

// ------------------------------------------------------------- compare --

const SERIES_HEX = [C.accent, "#3987e5", "#d95926"] as const;

function radarPts(values: readonly number[], cx: number, cy: number, r: number): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const d = (Math.max(0, Math.min(100, v)) / 100) * r;
      return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`;
    })
    .join(" ");
}

export type CompareFixture = FixtureChip;

/** The compare card: a compact radar beside the full table from the site, so the picture carries every number. */
export function CompareCard({ lines, axes, fixtures }: { lines: CompareLine[]; axes: readonly string[]; fixtures: Record<number, CompareFixture[]> }) {
  const size = 300;
  const c = size / 2;
  const r = 96;
  const n = axes.length;
  const col = lines.length === 3 ? 196 : 250;
  const rows: { label: string; cells: (l: CompareLine, k: number) => string; axis?: number }[] = [
    ...axes.map((label, k) => ({ label, axis: k, cells: (l: CompareLine) => `${l.raw[k]}` })),
    { label: "Owned", cells: (l: CompareLine) => `${l.row.ownership.toFixed(1)}%` },
  ];
  return (
    <CardFrame kicker="Percentiles among every outfield player with 270+ minutes" title={lines.map((l) => l.row.webName).join(" vs ") || "Compare players"}>
      {lines.length === 0 ? (
        <Empty text="Pick players to compare" />
      ) : (
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", position: "relative", width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {[25, 50, 75, 100].map((ring) => (
                <polygon key={ring} points={radarPts(Array(n).fill(ring), c, c, r)} fill="none" stroke="rgba(237,237,237,0.1)" strokeWidth="1" />
              ))}
              {axes.map((_, i) => {
                const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
                return <line key={i} x1={c} y1={c} x2={c + r * Math.cos(a)} y2={c + r * Math.sin(a)} stroke="rgba(237,237,237,0.1)" strokeWidth="1" />;
              })}
              {lines.map((l, i) => (
                <polygon key={l.row.fplId} points={radarPts(l.percentiles, c, c, r)} fill={SERIES_HEX[i]} fillOpacity="0.14" stroke={SERIES_HEX[i]} strokeWidth="2.5" strokeLinejoin="round" />
              ))}
            </svg>
            {axes.map((label, i) => {
              const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
              const x = c + (r + 26) * Math.cos(a);
              const y = c + (r + 22) * Math.sin(a);
              return (
                <div key={label} style={{ position: "absolute", left: x - 60, top: y - 9, width: 120, display: "flex", justifyContent: "center", fontSize: 13, color: C.muted }}>
                  {label}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {/* header: one column per player */}
            <div style={{ display: "flex", paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", width: 150 }} />
              {lines.map((l, i) => (
                <div key={l.row.fplId} style={{ display: "flex", alignItems: "center", gap: 8, width: col }}>
                  <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: SERIES_HEX[i] }} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", fontSize: 20 }}>{l.row.webName}</div>
                    <div style={{ display: "flex", fontSize: 14, color: C.faint }}>
                      {l.row.team} · £{l.row.priceM.toFixed(1)}m
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {rows.map((row) => {
              const best = row.axis !== undefined && lines.length > 1 ? Math.max(...lines.map((l) => l.percentiles[row.axis!]!)) : null;
              return (
                <div key={row.label} style={{ display: "flex", alignItems: "center", height: 33, borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ display: "flex", width: 150, fontSize: 15, color: C.muted }}>{row.label}</div>
                  {lines.map((l) => {
                    const lead = best !== null && l.percentiles[row.axis!] === best;
                    return (
                      <div key={l.row.fplId} style={{ display: "flex", alignItems: "baseline", gap: 8, width: col }}>
                        <div style={{ display: "flex", fontSize: 18, color: lead ? C.accent : C.text }}>{row.cells(l, 0)}</div>
                        {row.axis !== undefined && <div style={{ display: "flex", fontSize: 13, color: lead ? C.up : C.faint }}>{l.percentiles[row.axis]}th pct</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", height: 40 }}>
              <div style={{ display: "flex", width: 150, fontSize: 15, color: C.muted }}>Next five</div>
              {lines.map((l) => (
                <div key={l.row.fplId} style={{ display: "flex", width: col }}>
                  <FdrChips fixtures={fixtures[l.row.fplId] ?? []} width={lines.length === 3 ? 34 : 42} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CardFrame>
  );
}

// -------------------------------------------------------------- league --

function MiniBars({ title, items, max = 4 }: { title: string; items: LeagueCount[]; max?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 15, color: C.muted }}>{title}</div>
      {items.slice(0, max).map((c) => (
        <div key={c.fplId} style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
          <Shirt teamCode={c.teamCode} position={c.position} size={20} />
          <div style={{ display: "flex", width: 120, fontSize: 16 }}>{c.name}</div>
          <div style={{ display: "flex", flex: 1, height: 6, borderRadius: 3, background: C.raised }}>
            <div style={{ display: "flex", width: `${Math.max(3, c.share)}%`, height: 6, borderRadius: 3, background: C.accent }} />
          </div>
          <div style={{ display: "flex", width: 44, justifyContent: "flex-end", fontSize: 15 }}>{c.share}%</div>
        </div>
      ))}
      {items.length === 0 && <div style={{ display: "flex", fontSize: 14, color: C.faint }}>None</div>}
    </div>
  );
}

export function LeagueCard({ spy }: { spy: LeagueSpy & { gameweek: number } }) {
  const rows = spy.table.slice(0, 8);
  return (
    <CardFrame kicker={`Mini-league · Gameweek ${spy.gameweek} · ${spy.analysed} teams read`} title={spy.name}>
      <div style={{ display: "flex", flex: 1, gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <div style={{ display: "flex", height: 24, fontSize: 13, color: C.faint, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", width: 50 }}>#</div>
            <div style={{ display: "flex", flex: 1 }}>Team</div>
            <div style={{ display: "flex", width: 50, justifyContent: "flex-end" }}>GW</div>
            <div style={{ display: "flex", width: 70, justifyContent: "flex-end" }}>Total</div>
            <div style={{ display: "flex", width: 130, paddingLeft: 18 }}>Captain</div>
          </div>
          {rows.map((r) => (
            <div key={r.entry} style={{ display: "flex", alignItems: "center", height: 40, borderBottom: `1px solid ${C.line}`, fontSize: 17 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, width: 50 }}>
                {r.rank}
                {r.move !== 0 && <span style={{ display: "flex", fontSize: 11, color: r.move > 0 ? C.up : C.down }}>{r.move > 0 ? "▲" : "▼"}</span>}
              </div>
              <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>{r.team.length > 26 ? `${r.team.slice(0, 25)}…` : r.team}</div>
              <div style={{ display: "flex", width: 50, justifyContent: "flex-end" }}>{r.gameweek}</div>
              <div style={{ display: "flex", width: 70, justifyContent: "flex-end", color: C.muted }}>{r.total.toLocaleString("en-GB")}</div>
              <div style={{ display: "flex", width: 130, paddingLeft: 18, fontSize: 15, color: C.muted }}>{r.captain ?? "—"}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
          <MiniBars title="Captains this gameweek" items={spy.captains} />
          {spy.you ? (
            <>
              <MiniBars title="Your differentials" items={spy.you.differentials} max={3} />
            </>
          ) : (
            <MiniBars title="Most owned in the league" items={spy.owned} max={3} />
          )}
        </div>
      </div>
    </CardFrame>
  );
}
