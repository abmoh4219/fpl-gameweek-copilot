import { kitFor } from "@fpl/shared";

/**
 * The frame every shareable card is drawn in (ADR-0019): 1200×630, which X,
 * Telegram and WhatsApp all show uncropped, in the site's dark theme, with
 * the watermark — the Armband mark and the address — on every card.
 * Rendered by next/og, so only flexbox layout and inline SVG are available,
 * and the font is Geist (next/og's default).
 */
export const CARD_SIZE = { width: 1200, height: 630 };

export const C = {
  bg: "#0e0e10",
  panel: "#151517",
  raised: "#1c1c1f",
  line: "rgba(237,237,237,0.09)",
  text: "#ededed",
  muted: "#a1a1a6",
  faint: "#85858b",
  accent: "#d6ff3a",
  accentInk: "#0b1500",
  up: "#4cc38a",
  down: "#e5484d",
  warn: "#e8b04a",
  grass: "#0b7a3e",
  grass2: "#0d8444",
} as const;

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={Math.round(size * 1.12)} height={size} viewBox="0 0 36 32">
      <path d="M7 6 H34.5 L29.5 26 H2 Z" fill={C.accent} stroke={C.accent} strokeWidth="2" strokeLinejoin="round" />
      <path d="M5.8 10.2 H33 M3.6 21.8 H30.6" stroke={C.accentInk} strokeWidth="1.3" opacity="0.4" />
      <path d="M21.6 12.4 A5 5 0 1 0 21.6 19.6" fill="none" stroke={C.accentInk} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

/** A flat shirt in the club's colours: our own artwork, never an official kit image. */
export function Shirt({ teamCode, position, size = 40 }: { teamCode: number; position: string; size?: number }) {
  const kit = kitFor(teamCode, position);
  const body = "M12 4 L16 2 Q20 5 24 2 L28 4 L37 10 L33 17 L29 15 L29 37 L11 37 L11 15 L7 17 L3 10 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <clipPath id={`s${teamCode}${position}`}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={kit.primary} />
      {kit.pattern === "stripes" && (
        <g clipPath={`url(#s${teamCode}${position})`} fill={kit.secondary}>
          <rect x="14" y="0" width="3" height="40" />
          <rect x="20" y="0" width="3" height="40" />
          <rect x="26" y="0" width="3" height="40" />
        </g>
      )}
      {kit.pattern === "sleeves" && (
        <g fill={kit.secondary}>
          <path d="M12 4 L3 10 L7 17 L11 15 Z" />
          <path d="M28 4 L37 10 L33 17 L29 15 Z" />
        </g>
      )}
      <path d={body} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
    </svg>
  );
}

/** Header, body and the watermark footer. */
export function CardFrame({ kicker, title, note, children }: { kicker: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "44px 56px 32px", background: C.bg, color: C.text }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", fontSize: 22, color: C.muted }}>{kicker}</div>
        <div style={{ display: "flex", fontSize: 50, letterSpacing: -1.5, lineHeight: 1.05 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 24 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={26} />
          <div style={{ display: "flex", fontSize: 22, color: C.text }}>armband.abdela.dev</div>
        </div>
        <div style={{ display: "flex", fontSize: 18, color: C.faint }}>{note ?? "Data: Fantasy Premier League · computed by Armband"}</div>
      </div>
    </div>
  );
}

/** "+312k", "−48k", "1,204". */
export function compact(n: number, signed = false): string {
  const abs = Math.abs(n);
  const body = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)}m` : abs >= 10_000 ? `${Math.round(abs / 1000)}k` : abs.toLocaleString("en-GB");
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return `${sign}${body}`;
}

/** One upcoming fixture, as the cards draw it: FPL's difficulty colour, home in capitals. */
export interface FixtureChip {
  gameweek: number;
  label: string;
  difficulty: number | null;
}

const FDR_COLOURS: Record<number, [string, string]> = {
  1: ["#257d5a", "#ffffff"],
  2: ["#00e07a", "#062b17"],
  3: ["#3a3a3f", "#ededed"],
  4: ["#ff1751", "#ffffff"],
  5: ["#80072d", "#ffffff"],
};

export function FdrChips({ fixtures, width = 40 }: { fixtures: readonly FixtureChip[]; width?: number }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {fixtures.map((f) => {
        const [bg, ink] = f.difficulty === null ? [C.raised, C.faint] : (FDR_COLOURS[f.difficulty] ?? [C.raised, C.text]);
        return (
          <div key={f.gameweek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width, height: 22, borderRadius: 4, background: bg, color: ink, fontSize: 11 }}>
            {f.label}
          </div>
        );
      })}
    </div>
  );
}
