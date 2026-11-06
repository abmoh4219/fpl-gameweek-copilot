import type { ChipWeek } from "@fpl/shared";

/**
 * Chips and the next five gameweeks (ADR-0021): the facts behind chip timing
 * for this squad, never a call. FPL's own rules decide which chips are left.
 */
export function ChipPlanner({ weeks, used }: { weeks: ChipWeek[]; used: { name: string; gameweek: number }[] }) {
  if (weeks.length === 0) return null;
  return (
    <section className="sq-panel cp" aria-label="Chips and the next five gameweeks">
      <h2>
        Chips and your next five <small>an estimate of fixtures, not a call</small>
      </h2>
      <table className="cp-table">
        <thead>
          <tr>
            <th scope="col">GW</th>
            <th scope="col">Playing</th>
            <th scope="col">Doubles</th>
            <th scope="col">Blanks</th>
            <th scope="col">XI difficulty</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.gameweek}>
              <th scope="row">GW{w.gameweek}</th>
              <td>
                {w.playing}
                <small>/15</small>
              </td>
              <td className={w.doubles > 0 ? "up" : undefined}>{w.doubles}</td>
              <td className={w.blanks > 0 ? "down" : undefined}>{w.blanks}</td>
              <td>
                {w.xiDifficulty === null ? (
                  "—"
                ) : (
                  <span className={`cp-fdr d${Math.min(5, Math.max(1, Math.round(w.xiDifficulty)))}`}>{w.xiDifficulty.toFixed(1)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sq-quiet cp-used">
        {used.length === 0 ? "No chips played yet this season." : `Played: ${used.map((c) => `${c.name} (GW${c.gameweek})`).join(" · ")}`}
      </p>
    </section>
  );
}
