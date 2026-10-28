import Link from "next/link";
import { kitImageUrl, type Squad, type SquadPlayer } from "@fpl/shared";
import { FplPitch, type PlateValue } from "@/components/pitch/FplPitch";
import { ScoreBug } from "@/components/pitch/ScoreBug";
import { getViewer } from "@/lib/auth/server";
import { FplUnavailableError, TeamNotFoundError } from "@/lib/fpl";
import { loadSquad } from "@/lib/squad";

const fmt = new Intl.NumberFormat("en-GB");

async function squadOrError(teamId: number): Promise<{ squad: Squad } | { error: string }> {
  try {
    return { squad: await loadSquad(teamId) };
  } catch (error) {
    if (error instanceof TeamNotFoundError) return { error: "FPL no longer has this team. Connect a different one in Settings." };
    if (error instanceof FplUnavailableError) {
      return { error: "FPL isn't answering right now — it pauses while a gameweek is being scored. Your team will be back in a few minutes." };
    }
    return { error: "We couldn't load your squad just now. Try again in a moment." };
  }
}

function Kit({ p, size = 36 }: { p: SquadPlayer; size?: number }) {
  return <img src={kitImageUrl(p.teamCode, p.position === "GKP", 66)} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
}

function nextFixture(p: SquadPlayer): string {
  const f = p.fixtures[0];
  if (!f || f.isBlank || !f.opponent) return "no fixture";
  return `${f.opponent} (${f.isHome ? "H" : "A"})`;
}

/** Everything in the squad check is computed from the squad: no opinions, no model. */
function SquadCheck({ squad }: { squad: Squad }) {
  const all = [...squad.starters, ...squad.bench];
  const captain = squad.starters.find((p) => p.isCaptain) ?? null;
  const flagged = all.filter((p) => p.status !== "a");
  const hardRuns = squad.starters.filter((p) => p.status === "a" && p.fixtureBand === "Hard");
  const gameweeks = captain?.fixtures.map((f) => f.gameweek) ?? all[0]?.fixtures.map((f) => f.gameweek) ?? [];

  return (
    <div className="check-col">
      {captain && (
        <section className="panel captain">
          <div className="panel-head">
            <span className="on-air">Captain</span>
            <span className="panel-meta">GW{squad.gameweek + 1}</span>
          </div>
          <div className="captain-body">
            <Kit p={captain} size={64} />
            <div>
              <div className="captain-name">{captain.webName}</div>
              <div className="muted small">
                {captain.team} · {captain.position} · next {nextFixture(captain)}
              </div>
            </div>
          </div>
          <dl className="stat-row">
            <div>
              <dt>xGI / 90</dt>
              <dd>{captain.xgiPer90.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Last 4</dt>
              <dd>{captain.formPoints} pts</dd>
            </div>
            <div>
              <dt>Minutes risk</dt>
              <dd>{captain.minutesRisk}</dd>
            </div>
            <div>
              <dt>
                Run <span className="est-dot" title="Estimate" />
              </dt>
              <dd>{captain.fixtureBand}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Needs a look</h2>
          <span className="panel-meta">{flagged.length + hardRuns.length || "all clear"}</span>
        </div>
        {flagged.length + hardRuns.length === 0 && <p className="panel-empty">Everyone is fit, and no starter faces a hard run.</p>}
        {flagged.map((p) => (
          <div className="look-row" key={`f${p.fplId}`}>
            <Kit p={p} />
            <div className="look-text">
              <b>{p.webName}</b>
              <small>{p.news || (p.status === "d" ? "Doubtful" : "Unavailable")}</small>
            </div>
            <span className={`chance ${p.status === "d" ? "d" : "x"}`}>
              {p.status === "d" ? `${p.chanceOfPlayingNextRound ?? 50}%` : "Out"}
            </span>
          </div>
        ))}
        {hardRuns.map((p) => (
          <div className="look-row" key={`h${p.fplId}`}>
            <Kit p={p} />
            <div className="look-text">
              <b>{p.webName}</b>
              <small>Hard fixture run ahead (estimate)</small>
            </div>
            <span className="chance hard">Hard</span>
          </div>
        ))}
      </section>

      {gameweeks.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Next {gameweeks.length} gameweeks</h2>
            <span className="panel-meta">FPL difficulty</span>
          </div>
          <div className="fdr" role="table" aria-label="Fixture difficulty for each player">
            <div className="fdr-row head" role="row">
              <span role="columnheader">Player</span>
              {gameweeks.map((gw) => (
                <span role="columnheader" key={gw}>
                  GW{gw}
                </span>
              ))}
            </div>
            {all.map((p) => (
              <div className={`fdr-row${p.isStarter ? "" : " is-bench"}`} role="row" key={p.fplId}>
                <span role="cell" className="fdr-name">
                  {p.webName}
                </span>
                {p.fixtures.map((f) => (
                  <span
                    role="cell"
                    key={f.gameweek}
                    className={`fdr-cell d${f.isBlank ? "x" : (f.difficulty ?? 3)}`}
                    title={f.isBlank ? "Blank gameweek" : `${f.opponent ?? "?"} ${f.isHome ? "home" : "away"} · difficulty ${f.difficulty ?? "?"}`}
                  >
                    {f.isBlank ? "—" : f.isHome ? (f.opponent ?? "?") : (f.opponent ?? "?").toLowerCase()}
                    {f.isDouble && <sup>2</sup>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default async function MyTeam({ searchParams }: { searchParams: Promise<{ view?: string; welcome?: string }> }) {
  const viewer = await getViewer();
  // The layout guarantees both; this keeps TypeScript honest.
  const teamId = viewer?.profile?.fpl_team_id;
  if (!viewer || !teamId) return null;

  const { view, welcome } = await searchParams;
  const value: PlateValue = view === "points" ? "points" : "fixture";
  const result = await squadOrError(teamId);
  const first = (viewer.name ?? viewer.profile?.manager_name ?? "").split(" ")[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="page-kicker">
            My team{"squad" in result ? ` · Gameweek ${result.squad.gameweek + 1} next` : ""}
          </span>
          <h1 className="page-title">
            {first ? (
              <>
                {first}&apos;s <em>dugout</em>
              </>
            ) : (
              <>
                Your <em>dugout</em>
              </>
            )}
          </h1>
          {"squad" in result && (
            <p className="page-sub">
              {result.squad.teamName} · {result.squad.managerName}
              {result.squad.overallRank !== null && <> · Overall rank {fmt.format(result.squad.overallRank)}</>}
            </p>
          )}
        </div>
      </header>

      {welcome === "1" && (
        <div className="notice ok welcome" role="status">
          <b>You&apos;re in.</b> {"squad" in result ? `${result.squad.teamName} is connected` : "Your team is connected"} — this
          is your dugout. Your squad updates every time you open it.
        </div>
      )}

      {"error" in result ? (
        <div className="notice error">{result.error}</div>
      ) : (
        <div className="dash">
          <section className="dash-pitch" aria-label="Your squad">
            <div className="pitch-bar">
              <ScoreBug squad={result.squad} />
              <div className="seg" role="group" aria-label="Show under each player">
                <Link href="/app" className={value === "fixture" ? "on" : undefined} aria-current={value === "fixture" ? "true" : undefined}>
                  Next fixture
                </Link>
                <Link href="/app?view=points" className={value === "points" ? "on" : undefined} aria-current={value === "points" ? "true" : undefined}>
                  GW{result.squad.gameweek} points
                </Link>
              </div>
            </div>
            <FplPitch squad={result.squad} value={value} />
          </section>
          <SquadCheck squad={result.squad} />
        </div>
      )}
    </div>
  );
}
