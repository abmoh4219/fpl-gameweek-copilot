import type { StatRow, TemplateXi, TransferRadar, WatchRow } from "@fpl/shared";
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
