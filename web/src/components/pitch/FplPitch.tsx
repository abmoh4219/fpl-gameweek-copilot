import type { HighlightTone, Squad, SquadPlayer } from "@fpl/shared";
import { Kit } from "./Kit";
import "./pitch.css";

/**
 * The squad on an FPL-style pitch (docs/product-plan.md): bright striped
 * grass, official kits, white name plates, and under each the next fixture
 * or this gameweek's points. Server-rendered; the kit image is the only
 * client piece (it falls back to our own shirt if FPL's image fails).
 */
export type PlateValue = "fixture" | "points";

const ROWS = ["GKP", "DEF", "MID", "FWD"] as const;

function nextFixture(p: SquadPlayer): string {
  const f = p.fixtures[0];
  if (!f || f.isBlank || !f.opponent) return "—";
  return `${f.opponent} (${f.isHome ? "H" : "A"})`;
}

function status(p: SquadPlayer): "ok" | "doubt" | "out" {
  if (p.status === "a") return "ok";
  return p.status === "d" ? "doubt" : "out";
}

const TONE_LABEL: Record<HighlightTone, string> = { buy: "Buy", sell: "Sell", keep: "Keep", watch: "Watch" };

interface CardProps {
  p: SquadPlayer;
  value: PlateValue;
  compact: boolean;
  picked: boolean;
  tone: { tone: HighlightTone; note: string } | undefined;
  onSelect: ((p: SquadPlayer) => void) | undefined;
}

function Card({ p, value, compact, picked, tone, onSelect }: CardProps) {
  const s = status(p);
  const className = `fpl-card${compact ? " compact" : ""}${picked ? " is-pick" : ""}${tone ? ` hl hl-${tone.tone}` : ""}${onSelect ? " tappable" : ""}`;
  const inner = (
    <>
      {(p.isCaptain || p.isViceCaptain) && <span className="fpl-badge">{p.isCaptain ? "C" : "V"}</span>}
      {s !== "ok" && (
        <span className={`fpl-flag ${s}`} title={p.news || (s === "out" ? "Unavailable" : "Doubtful")}>
          !
        </span>
      )}
      {tone && <span className="fpl-hl">{TONE_LABEL[tone.tone]}</span>}
      <Kit
        teamCode={p.teamCode}
        isKeeper={p.position === "GKP"}
        team={p.team}
        fallback={p.kit}
        id={`k-${p.fplId}`}
      />
      <div className={`fpl-name${s === "ok" ? "" : ` ${s}`}`}>{p.webName}</div>
      <div className="fpl-sub">{value === "points" ? (p.isStarter ? p.pickPoints : p.eventPoints) : nextFixture(p)}</div>
    </>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        data-fpl-id={p.fplId}
        onClick={() => onSelect(p)}
        title={tone?.note}
        aria-label={`${p.webName}, ${p.team} ${p.position}${tone ? `, ${TONE_LABEL[tone.tone]}: ${tone.note}` : ""}. Open player card`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={className} data-fpl-id={p.fplId}>
      {inner}
    </div>
  );
}

export function FplPitch({
  squad,
  value = "fixture",
  compact = false,
  highlight,
  highlights,
  onSelect,
}: {
  squad: Squad;
  value?: PlateValue;
  compact?: boolean;
  /** One player to spotlight, e.g. the co-pilot's pick. */
  highlight?: number;
  /** Players the co-pilot is talking about, by FPL id. */
  highlights?: Map<number, { tone: HighlightTone; note: string }>;
  /** Makes each player a button that opens their card. */
  onSelect?: (p: SquadPlayer) => void;
}) {
  return (
    <div className="fpl">
      <div className="fpl-pitch">
        <svg className="fpl-pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="var(--grass-line)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" opacity="0.9">
            <rect x="3" y="2" width="94" height="96" />
            <rect x="24" y="2" width="52" height="17" />
            <rect x="37" y="2" width="26" height="7" />
            <path d="M40 19 Q50 25 60 19" />
            <line x1="3" y1="98" x2="97" y2="98" />
            <path d="M36 98 A14 14 0 0 1 64 98" />
          </g>
        </svg>
        <div className="fpl-rows">
          {ROWS.map((pos) => (
            <div className="fpl-row" key={pos}>
              {squad.starters
                .filter((p) => p.position === pos)
                .map((p) => (
                  <Card key={p.fplId} p={p} value={value} compact={compact} picked={p.fplId === highlight} tone={highlights?.get(p.fplId)} onSelect={onSelect} />
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="fpl-bench">
        <span className="fpl-bench-label">Substitutes</span>
        {squad.bench.map((p) => (
          <Card key={p.fplId} p={p} value={value} compact picked={p.fplId === highlight} tone={highlights?.get(p.fplId)} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
