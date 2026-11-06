import type { CompareLine, GameweekWrapped, StatRow, TemplateXi, TransferRadar, WatchRow } from "@fpl/shared";
import { C, CardFrame, Shirt, compact } from "./frame";

/** The shareable cards, drawn for next/og (ADR-0019). Pure: data in, picture out. */

function Empty({ text }: { text: string }) {
  return <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 30, color: C.muted }}>{text}</div>;
}

// ------------------------------------------------------------ transfers --

function RadarColumn({ title, rows, tone }: { title: string; rows: StatRow[]; tone: "in" | "out" }) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.netTransfers)));
  const colour = tone === "in" ? C.up : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: C.muted }}>
        <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: colour }} />
        {title}
      </div>
      {rows.map((r) => (
        <div key={r.fplId} style={{ display: "flex", alignItems: "center", gap: 14, height: 62, padding: "0 16px", borderRadius: 12, background: C.panel }}>
          <Shirt teamCode={r.teamCode} position={r.position} size={40} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 26 }}>{r.webName}</div>
            <div style={{ display: "flex", fontSize: 17, color: C.faint }}>
              {r.team} · {r.position} · £{r.priceM.toFixed(1)}m · {r.ownership.toFixed(1)}% owned
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: 150 }}>
            <div style={{ display: "flex", fontSize: 26, color: colour }}>{compact(r.netTransfers, true)}</div>
            <div style={{ display: "flex", width: 150, height: 4, borderRadius: 2, background: C.raised, justifyContent: "flex-end" }}>
              <div style={{ display: "flex", width: `${Math.max(6, (Math.abs(r.netTransfers) / top) * 100)}%`, height: 4, borderRadius: 2, background: colour }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransferRadarCard({ radar, gameweek, date }: { radar: TransferRadar; gameweek: number | null; date: string }) {
  return (
    <CardFrame kicker={`${gameweek ? `Gameweek ${gameweek} · ` : ""}net transfers${date ? ` to ${date}` : ""}`} title="The transfer radar">
      {radar.in.length + radar.out.length === 0 ? (
        <Empty text="No transfers counted yet this gameweek" />
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 28 }}>
          <RadarColumn title="Most transferred in" rows={radar.in} tone="in" />
          <RadarColumn title="Most transferred out" rows={radar.out} tone="out" />
        </div>
      )}
    </CardFrame>
  );
}

// ---------------------------------------------------------- template XI --

function PitchPlayer({ p }: { p: StatRow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: 220 }}>
      <Shirt teamCode={p.teamCode} position={p.position} size={38} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", padding: "1px 8px", borderRadius: 6, background: "rgba(14,14,16,0.82)", fontSize: 19 }}>{p.webName}</div>
        <div style={{ display: "flex", marginTop: 2, paddingLeft: 8, fontSize: 16, color: C.accent }}>{p.ownership.toFixed(1)}% owned</div>
      </div>
    </div>
  );
}

export function TemplateXiCard({ xi, gameweek }: { xi: TemplateXi | null; gameweek: number | null }) {
  if (!xi) return <CardFrame kicker="Most-owned XI" title="The template XI"><Empty text="Ownership isn't available right now" /></CardFrame>;
  const lines = (["GKP", "DEF", "MID", "FWD"] as const).map((pos) => xi.players.filter((p) => p.position === pos));
  const total = xi.players.reduce((s, p) => s + p.ownership, 0) / xi.players.length;
  return (
    <CardFrame kicker={`${gameweek ? `Gameweek ${gameweek} · ` : ""}${xi.formation} · average ownership ${total.toFixed(1)}%`} title="The template XI">
      {/* the pitch on its side: our goal on the left, attacking right */}
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
              <PitchPlayer key={p.fplId} p={p} />
            ))}
          </div>
        ))}
      </div>
    </CardFrame>
  );
}

// ------------------------------------------------------------ prices --

function PriceColumn({ title, rows, tone }: { title: string; rows: WatchRow[]; tone: "rise" | "fall" }) {
  const colour = tone === "rise" ? C.up : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: C.muted }}>
        <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: colour }} />
        {title}
      </div>
      {rows.map((r) => {
        const pct = Math.abs(r.percent);
        return (
          <div key={r.fplId} style={{ display: "flex", alignItems: "center", gap: 16, height: 62, padding: "0 16px", borderRadius: 12, background: C.panel }}>
            <div style={{ display: "flex", flexDirection: "column", width: 230 }}>
              <div style={{ display: "flex", fontSize: 26 }}>{r.webName}</div>
              <div style={{ display: "flex", fontSize: 17, color: C.faint }}>
                {r.team} · {r.position} · £{r.priceM.toFixed(1)}m{r.locked ? " · locked" : ""}
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, position: "relative", height: 10, borderRadius: 5, background: C.raised }}>
              <div style={{ display: "flex", width: `${Math.min(100, pct)}%`, height: 10, borderRadius: 5, background: colour }} />
            </div>
            <div style={{ display: "flex", width: 90, justifyContent: "flex-end", fontSize: 24, color: C.text }}>
              {pct >= 100 ? "100%+" : `${Math.round(pct)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PricesTonightCard({ rising, falling, date }: { rising: WatchRow[]; falling: WatchRow[]; date: string }) {
  return (
    <CardFrame
      kicker={`Progress toward a price change${date ? ` · ${date}` : ""} · an estimate`}
      title="Tonight's price watch"
      note="FPL's own price data · past 100% is not a confirmed change"
    >
      {rising.length + falling.length === 0 ? (
        <Empty text="Nobody is close to a price change tonight" />
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 28 }}>
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
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, height: 150, padding: "0 22px", borderRadius: 14, background: C.panel }}>
      <div style={{ display: "flex", fontSize: 19, color: C.muted }}>{label}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 32, color: colour }}>{value}</div>
      {sub && <div style={{ display: "flex", marginTop: 4, fontSize: 18, color: C.faint }}>{sub}</div>}
    </div>
  );
}

export function WrappedCard({ w, team, finished }: { w: GameweekWrapped; team: string; finished: boolean }) {
  const diff = w.average !== null ? w.net - w.average : null;
  const rank = w.overallRank !== null ? w.overallRank.toLocaleString("en-GB") : "—";
  return (
    <CardFrame kicker={`${team}${w.chip ? ` · ${w.chip}` : ""}${finished ? "" : " · live, points so far"}`} title={`Gameweek ${w.gameweek}, wrapped`}>
      <div style={{ display: "flex", flex: 1, gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 440 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 150, lineHeight: 1, letterSpacing: -6, color: C.accent }}>{w.net}</div>
            <div style={{ display: "flex", fontSize: 30, color: C.muted }}>points</div>
          </div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 26, color: C.muted }}>
            {w.average !== null ? (
              <>
                Average {w.average} ·{" "}
                <span style={{ display: "flex", marginLeft: 8, color: diff! >= 0 ? C.up : C.down }}>{diff! >= 0 ? `+${diff} above` : `${Math.abs(diff!)} below`}</span>
              </>
            ) : (
              "This gameweek"
            )}
          </div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 24, color: C.muted }}>
            Overall rank {rank}
            {w.rankMove !== null && w.rankMove !== 0 && (
              <span style={{ display: "flex", marginLeft: 10, color: w.rankMove > 0 ? C.up : C.down }}>
                {w.rankMove > 0 ? "▲" : "▼"} {Math.abs(w.rankMove).toLocaleString("en-GB")}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, flex: 1, alignContent: "center" }}>
          <Tile label="Captain" value={w.captain ? `${w.captain.name}` : "—"} sub={w.captain ? `${w.captain.points} pts with the armband` : undefined} />
          <Tile
            label="Best captain in your XI"
            value={w.bestCaptain ? (w.bestCaptain.isYours ? "You picked it" : w.bestCaptain.name) : "—"}
            sub={w.bestCaptain ? `${w.bestCaptain.points} pts with the armband` : undefined}
            tone={w.bestCaptain?.isYours ? "up" : undefined}
          />
          <Tile label="Left on the bench" value={`${w.benchPoints} pts`} tone={w.benchPoints >= 10 ? "down" : undefined} />
          <Tile
            label="Transfers"
            value={w.transfers === 0 ? "None" : `${w.transfers} made`}
            sub={w.hits > 0 ? `−${w.hits} pts in hits` : "No hits"}
            tone={w.hits > 0 ? "down" : undefined}
          />
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

const FDR_HEX: Record<number, [string, string]> = {
  1: ["#257d5a", "#ffffff"],
  2: ["#00e07a", "#062b17"],
  3: ["#3a3a3f", "#ededed"],
  4: ["#ff1751", "#ffffff"],
  5: ["#80072d", "#ffffff"],
};

export interface CompareFixture {
  gameweek: number;
  label: string;
  difficulty: number | null;
}

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
                <div key={l.row.fplId} style={{ display: "flex", gap: 3, width: col }}>
                  {(fixtures[l.row.fplId] ?? []).map((f) => {
                    const [bg, ink] = f.difficulty === null ? [C.raised, C.faint] : FDR_HEX[f.difficulty] ?? [C.raised, C.text];
                    return (
                      <div key={f.gameweek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: lines.length === 3 ? 34 : 42, height: 22, borderRadius: 4, background: bg, color: ink, fontSize: 11 }}>
                        {f.label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CardFrame>
  );
}
