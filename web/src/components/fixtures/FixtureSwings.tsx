import { fixtureSwings, kitImageUrl, type FixtureSwing, type GridRow } from "@fpl/shared";
import { How } from "@/components/charts/How";

/**
 * Fixture swings as small multiples: one mini line per club of FPL difficulty
 * across the next five gameweeks, easier plotted higher, the opponent under
 * each point. It DESCRIBES a change in FPL's rating (next two vs the three
 * after) and shows the numbers behind it, including the five-game average,
 * so a run that "gets easier" can still be seen to be hard. Never advice.
 */
const W = 220;
const H = 92;
const PAD = { x: 16, top: 12, bottom: 26 };

function Spark({ s, opponents }: { s: FixtureSwing; opponents: string[] }) {
  const n = s.difficulty.length;
  const x = (i: number) => PAD.x + (i * (W - PAD.x * 2)) / Math.max(1, n - 1);
  // Difficulty 1 (easiest) at the top, 5 at the bottom.
  const y = (d: number) => PAD.top + ((d - 1) / 4) * (H - PAD.top - PAD.bottom);
  let path = "";
  s.difficulty.forEach((d, i) => {
    if (d === null) return;
    path += `${path && s.difficulty[i - 1] !== null ? "L" : "M"}${x(i)},${y(d)} `;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className={`sw-spark ${s.direction}`} aria-hidden="true">
      {[1, 3, 5].map((d) => (
        <line key={d} x1={PAD.x} x2={W - PAD.x} y1={y(d)} y2={y(d)} className="chart-grid" />
      ))}
      <path d={path} className="sw-line" />
      {s.difficulty.map((d, i) =>
        d === null ? (
          <text key={i} x={x(i)} y={y(3) + 4} textAnchor="middle" className="chart-tick">
            —
          </text>
        ) : (
          <circle key={i} cx={x(i)} cy={y(d)} r={4.5} className="sw-dot">
            <title>{`GW${s.gameweeks[i]}: ${opponents[i]} · difficulty ${Number.isInteger(d) ? d : d.toFixed(1)}`}</title>
          </circle>
        ),
      )}
      {opponents.map((o, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="chart-tick">
          {o}
        </text>
      ))}
    </svg>
  );
}

function Card({ s, row }: { s: FixtureSwing; row: GridRow }) {
  // FPL convention: home in capitals, away in lower case; a double shows its first opponent.
  const opponents = row.cells.map((c) => {
    const f = c.fixtures[0];
    if (!f) return "—";
    return f.isHome ? f.opponent : f.opponent.toLowerCase();
  });
  const summary = `${row.team}: ${s.direction === "easier" ? "gets easier" : s.direction === "harder" ? "gets harder" : "steady"} over the next five gameweeks.`;
  return (
    <figure className="sw-card" aria-label={summary}>
      <figcaption>
        <img src={kitImageUrl(row.teamCode, false, 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={22} height={29} />
        <b>{row.team}</b>
        <span className={`sw-tag ${s.direction}`}>{s.direction === "easier" ? "▲ easier later" : s.direction === "harder" ? "▼ harder later" : "steady"}</span>
      </figcaption>
      <Spark s={s} opponents={opponents} />
      <p className="sw-facts">
        Next 2 <b>{s.early?.toFixed(1) ?? "—"}</b> → then <b>{s.late?.toFixed(1) ?? "—"}</b>
        <span>5-game avg {s.overall?.toFixed(1) ?? "—"}</span>
      </p>
    </figure>
  );
}

export function FixtureSwings({ rows }: { rows: GridRow[] }) {
  const swings = fixtureSwings(rows);
  const byTeam = new Map(rows.map((r) => [r.teamFplId, r]));
  const easier = swings.filter((s) => s.direction === "easier");
  const harder = swings.filter((s) => s.direction === "harder").reverse();
  const steady = swings.filter((s) => s.direction === "steady");
  if (easier.length + harder.length === 0) return null;

  return (
    <div className="ins-card sw">
      <h2 className="ins-title">Fixture swings</h2>
      <How>
        How each club&apos;s fixtures change across the next five gameweeks, using FPL&apos;s own difficulty rating (1 easy,
        5 hard), easier plotted higher. It compares the next two games with the three after, so it shows a change, not
        whether the whole run is easy: check the five-game average. FPL&apos;s rating ignores form and injuries; treat it
        as an estimate. Lower-case opponents are away.
      </How>
      {(
        [
          [`Gets easier after GW${swings[0]?.gameweeks[1] ?? ""}`, easier],
          [`Gets harder after GW${swings[0]?.gameweeks[1] ?? ""}`, harder],
        ] as const
      ).map(
        ([title, list]) =>
          list.length > 0 && (
            <section key={title} className="sw-group">
              <h3>{title}</h3>
              <div className="sw-grid">
                {list.map((s) => {
                  const row = byTeam.get(s.teamFplId);
                  return row ? <Card key={s.teamFplId} s={s} row={row} /> : null;
                })}
              </div>
            </section>
          ),
      )}
      {steady.length > 0 && <p className="sw-steady">Steady: {steady.map((s) => s.team).join(", ")}.</p>}
    </div>
  );
}
