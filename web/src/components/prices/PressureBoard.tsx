import Link from "next/link";
import { closestToChange, type WatchRow } from "@fpl/shared";

/**
 * Tonight at a glance: a diverging bar chart. The players closest to a rise
 * grow right, the closest to a fall grow left, from one centre line at 0%.
 * One scale for both sides, up to the largest value shown, with a tick at
 * the 100% threshold, so 115% reads longer than 101%. Bars <= 24px with a
 * rounded data end, names in text ink and a legend beside the colour. Past
 * 100% is marked "+", never shown as a change. Estimates, from FPL's own data.
 */
const PER_SIDE = 8;

function Bar({ r, side, max }: { r: WatchRow; side: "rise" | "fall"; max: number }) {
  // One shared scale for both sides, up to the largest value shown, with a tick at the 100% threshold.
  const width = (Math.abs(r.percent) / max) * 100;
  return (
    <div className={`pb-row ${side}`}>
      <Link href={`/players/${r.fplId}`} className="pb-name">
        {r.webName} <small>{r.team}</small>
      </Link>
      <span className="pb-track" aria-hidden="true">
        <i style={{ width: `${width}%` }} />
        <b className="pb-threshold" style={{ left: `${(100 / max) * 100}%` }} />
      </span>
      <span className="pb-value">
        {Math.abs(r.percent).toFixed(0)}%{r.overThreshold ? "+" : ""}
      </span>
    </div>
  );
}

export function PressureBoard({ rows }: { rows: WatchRow[] }) {
  const risers = closestToChange(rows, "rising", null, PER_SIDE);
  const fallers = closestToChange(rows, "falling", null, PER_SIDE);
  if (risers.length + fallers.length === 0) return null;
  const max = Math.max(100, ...[...risers, ...fallers].map((r) => Math.abs(r.percent)));
  const summary =
    `Closest to a rise: ${risers.map((r) => `${r.webName} ${Math.abs(r.percent).toFixed(0)}%`).join(", ")}. ` +
    `Closest to a fall: ${fallers.map((r) => `${r.webName} ${Math.abs(r.percent).toFixed(0)}%`).join(", ")}.`;

  return (
    <div className="ins-card pb">
      <h2 className="ins-title">Tonight at a glance</h2>
      <p className="ins-how">
        How far each player is toward a price change, from FPL&apos;s own data. 100% is the threshold, but a player can
        pass it and still not move: an estimate, never a promise.
      </p>
      <div className="pb-board" role="img" aria-label={summary}>
        <div className="pb-side">
          <span className="pb-side-label">
            <i className="lo" /> Toward a fall
          </span>
          {fallers.map((r) => (
            <Bar key={r.fplId} r={r} side="fall" max={max} />
          ))}
        </div>
        <div className="pb-side">
          <span className="pb-side-label">
            <i className="hi" /> Toward a rise
          </span>
          {risers.map((r) => (
            <Bar key={r.fplId} r={r} side="rise" max={max} />
          ))}
        </div>
      </div>
      <p className="pb-foot">The thin line in each bar is the 100% threshold. A + means past it without a change yet.</p>
    </div>
  );
}
