import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { squadTonight, type Squad } from "@fpl/shared";
import { Dugout } from "@/components/copilot/Dugout";
import { SquadCheck } from "@/components/copilot/SquadCheck";
import { DeadlineCountdown } from "@/components/team/DeadlineCountdown";
import { RememberTeam } from "@/components/team/RememberTeam";
import { SquadWatch } from "@/components/team/SquadWatch";
import { TeamShell } from "@/components/team/TeamShell";
import { FplUnavailableError, parseTeamId, TeamNotFoundError } from "@/lib/fpl";
import { deadlines, watchRows } from "@/lib/cards/data";
import { gafferData } from "@/lib/gaffer";
import { loadSquad } from "@/lib/squad";

type Params = { params: Promise<{ id: string }> };

const fmt = new Intl.NumberFormat("en-GB");

/**
 * A manager's dugout, by FPL team ID, with no account (ADR-0017). FPL teams
 * are public; this page reads one through the cached FPL calls and the shared
 * card read, and is kept out of search engines.
 */
async function squadOrError(id: number): Promise<{ squad: Squad } | { error: string }> {
  try {
    return { squad: await loadSquad(id) };
  } catch (error) {
    if (error instanceof TeamNotFoundError) notFound();
    if (error instanceof FplUnavailableError) {
      return { error: "FPL isn't answering right now — it pauses while a gameweek is being scored. This team will be back in a few minutes." };
    }
    return { error: "This team hasn't played a gameweek yet, or we couldn't load it just now. Try again in a moment." };
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseTeamId((await params).id);
  return { title: id ? `Team ${id}` : "Team not found", robots: { index: false, follow: false } };
}

export default async function TeamPage({ params }: Params) {
  const id = parseTeamId((await params).id);
  if (!id) notFound();
  const [result, watch, upcoming] = await Promise.all([squadOrError(id), watchRows(), deadlines()]);
  const gaffer = "squad" in result ? await gafferData(result.squad).catch(() => null) : null;

  return (
    <TeamShell
      action={
        <Link href="/team" className="btn">
          Change team
        </Link>
      }
    >
      {"error" in result ? (
        <div className="notice error">{result.error}</div>
      ) : (
        <>
          <header className="page-head">
            <div>
              <span className="page-kicker">
                Team {id} · <DeadlineCountdown deadlines={upcoming} withTime />
              </span>
              <h1 className="page-title">{result.squad.teamName}</h1>
              <p className="page-sub">
                {result.squad.managerName}
                {result.squad.overallRank !== null && <> · Overall rank {fmt.format(result.squad.overallRank)}</>} ·{" "}
                <RememberTeam id={id} name={result.squad.teamName} />
              </p>
            </div>
          </header>
          <SquadWatch squad={result.squad} tonight={squadTonight(result.squad, watch)} />
          <Dugout squad={result.squad} gaffer={gaffer} mode="live" />
          <SquadCheck squad={result.squad} />
        </>
      )}
    </TeamShell>
  );
}
