import type { BreakdownPart } from "@fpl/shared";

/**
 * One whole split into parts: a tall segmented bar (28px), each part its own
 * block with a 2px surface gap, its points printed inside where they fit,
 * and a legend that names every part with its points (so colour is never
 * the only key). Colour follows the stat (goals are always slot 2), never
 * its rank. Parts beyond the fixed slots fold into "Other".
 */
const SLOT: Record<string, string> = {
  minutes: "var(--cat-1)",
  goals_scored: "var(--cat-2)",
  assists: "var(--cat-3)",
  clean_sheets: "var(--cat-4)",
  bonus: "var(--cat-5)",
  defensive_contribution: "var(--cat-6)",
};

export function SegmentedBar({ parts, total, summary }: { parts: BreakdownPart[]; total: number; summary: string }) {
  const named = parts.filter((p) => SLOT[p.id]);
  const rest = parts.filter((p) => !SLOT[p.id]).reduce((a, p) => a + p.points, 0);
  const shown = rest > 0 ? [...named, { id: "other", label: "Other", points: rest }] : named;
  const sum = shown.reduce((a, p) => a + p.points, 0) || 1;
  const colour = (id: string) => SLOT[id] ?? "rgba(var(--ink-rgb), 0.3)";
  // Light fills (aqua, yellow, pink) take near-black text; the rest take white.
  const ink = (id: string) => (["assists", "clean_sheets", "bonus"].includes(id) ? "#10140f" : "#fff");

  return (
    <div className="pts-split">
      <div className="pts-split-bar" role="img" aria-label={summary}>
        {shown.map((p) => {
          const share = p.points / sum;
          return (
            <span key={p.id} className="pts-split-part" style={{ flexGrow: p.points, background: colour(p.id), color: ink(p.id) }} title={`${p.label}: ${p.points} pts`}>
              {share >= 0.09 && <b>{p.points}</b>}
            </span>
          );
        })}
      </div>
      <ul className="pts-split-legend">
        {shown.map((p) => (
          <li key={p.id}>
            <i style={{ background: colour(p.id) }} />
            {p.label} <b>{p.points}</b>
          </li>
        ))}
        <li className="pts-split-total">
          Total <b>{total}</b>
        </li>
      </ul>
    </div>
  );
}
