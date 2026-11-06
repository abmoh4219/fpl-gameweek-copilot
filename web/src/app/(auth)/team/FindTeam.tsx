"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kitImageUrl } from "@fpl/shared";
import { readMyTeam, saveMyTeam, type MyTeam } from "@/lib/my-team";
import { previewTeam, type TeamPreview } from "./actions";

const fmt = new Intl.NumberFormat("en-GB");

/** Step one: find the team. Step two: "Is this you?" — then remember it in this browser and open the dugout. */
export function FindTeam() {
  const router = useRouter();
  const [mine, setMine] = useState<MyTeam | null>(null);
  const [raw, setRaw] = useState("");
  const [team, setTeam] = useState<TeamPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, startLooking] = useTransition();
  const [saving, startSaving] = useTransition();

  useEffect(() => setMine(readMyTeam()), []);

  function find(e: React.FormEvent) {
    e.preventDefault();
    if (!raw.trim()) return;
    setError(null);
    startLooking(async () => {
      const result = await previewTeam(raw);
      if (result.ok) setTeam(result.team);
      else setError(result.error);
    });
  }

  function confirm() {
    if (!team) return;
    setError(null);
    startSaving(() => {
      saveMyTeam({ id: team.id, name: team.teamName });
      router.push(`/team/${team.id}`);
    });
  }

  if (team) {
    const initial = team.teamName.trim().slice(0, 1).toUpperCase() || "?";
    return (
      <div className="form">
        <div className="found" aria-live="polite">
          <div className="found-head">
            <span className="found-badge">{initial}</span>
            <div>
              <div className="found-name">{team.teamName}</div>
              <div className="found-manager">{team.managerName}</div>
            </div>
            <span className="found-id">ID {team.id}</span>
          </div>
          <div className="found-stats">
            <div>
              <b>{team.points === null ? "—" : fmt.format(team.points)}</b>
              <span>Points</span>
            </div>
            <div>
              <b>{team.rank === null ? "—" : fmt.format(team.rank)}</b>
              <span>Overall rank</span>
            </div>
            <div>
              <b>GW{team.startedEvent}</b>
              <span>Joined</span>
            </div>
          </div>
          {team.kits.length > 0 && (
            <ul className="found-kits" aria-label="This team's fifteen players">
              {team.kits.map((k, i) => (
                <li key={k.fplId} className={i >= 11 ? "is-bench" : undefined} title={k.name} style={{ animationDelay: `${i * 35}ms` }}>
                  <img src={kitImageUrl(k.teamCode, k.keeper, 66)} alt="" referrerPolicy="no-referrer" />
                  <span>{k.name}</span>
                  {k.captain && <i>C</i>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <button type="button" className="btn btn-accent btn-block" onClick={confirm} disabled={saving}>
          {saving ? <span className="spinner" /> : "Yes, that's my team"}
        </button>
        <button
          type="button"
          className="btn btn-block"
          onClick={() => {
            setTeam(null);
            setError(null);
          }}
          disabled={saving}
        >
          No, try another ID
        </button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={find} noValidate>
      {mine && (
        <Link href={`/team/${mine.id}`} className="btn btn-accent btn-block">
          Continue to {mine.name}
        </Link>
      )}
      <div className="field">
        <label htmlFor="team">Your FPL team ID</label>
        <input
          id="team"
          className="input big"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="e.g. 7653564"
          aria-invalid={error ? true : undefined}
          aria-describedby="team-help"
        />
        <span className="hint" id="team-help">
          You can paste the whole address of your Points page too.
        </span>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <button type="submit" className={`btn btn-block${mine ? "" : " btn-accent"}`} disabled={looking || !raw.trim()}>
        {looking ? <span className="spinner" /> : mine ? "Find another team" : "Find my team"}
      </button>

      <details className="where">
        <summary>Where do I find my team ID?</summary>
        <ol>
          <li>Open Fantasy Premier League and go to the <b>Points</b> tab.</li>
          <li>
            Look at the address bar: <span className="url">fantasy.premierleague.com/entry/<mark>7653564</mark>/event/8</span>
          </li>
          <li>The number after <b>/entry/</b> is your team ID. In the app, it&apos;s under your team name in Points.</li>
        </ol>
      </details>
    </form>
  );
}
