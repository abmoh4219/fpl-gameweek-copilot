import type { Squad } from "@fpl/shared";
import "./pitch.css";

/** The team's numbers as a broadcast score bug: name, gameweek points, total, bank. */
export function ScoreBug({ squad }: { squad: Squad }) {
  return (
    <div className="bug">
      <span className="bug-team">
        <i>{squad.teamName.slice(0, 1).toUpperCase()}</i>
        {squad.teamName}
      </span>
      <span className="bug-cell">
        <small>GW{squad.gameweek}</small>
        <b>{squad.gameweekPoints}</b>
      </span>
      <span className="bug-cell">
        <small>Total</small>
        <b>{squad.totalPoints}</b>
      </span>
      <span className="bug-cell">
        <small>Bank</small>
        <b>£{squad.bankM.toFixed(1)}m</b>
      </span>
    </div>
  );
}
