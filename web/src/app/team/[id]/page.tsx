import type { Metadata } from "next";
import Link from "next/link";
import { Workspace } from "@/components/Workspace";
import { FplUnavailableError, parseTeamId, TeamNotFoundError } from "@/lib/fpl";
import { loadSquad } from "@/lib/squad";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Team ${id}` };
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="center-page">
      <div style={{ maxWidth: 460 }}>
        <div className="section-label" style={{ justifyContent: "center" }}>
          <b>!</b> / team
        </div>
        <h1 className="h2">{title}</h1>
        <p className="lede" style={{ marginInline: "auto" }}>{body}</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 24 }}>
          ← Try another team ID
        </Link>
      </div>
    </div>
  );
}

export default async function TeamPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { q } = await searchParams;
  const teamId = parseTeamId(id);
  if (teamId === null) {
    return <Problem title="That is not a team ID" body="An FPL team ID is a number, like 7653564." />;
  }

  try {
    const squad = await loadSquad(teamId);
    const initialQuestion = typeof q === "string" ? q.slice(0, 300) : null;
    return (
      <>
        <section className="team-head">
          <div>
            <div className="section-label" style={{ marginBottom: 0 }}>
              <b>GW{squad.gameweek}</b> / {squad.managerName || "manager"} · team {squad.entryId}
            </div>
            <h1 className="team-name">{squad.teamName}</h1>
          </div>
          <div className="team-stats">
            <div>
              <div className="v">{squad.gameweekPoints}</div>
              <div className="k">GW pts</div>
            </div>
            <div>
              <div className="v">{squad.totalPoints}</div>
              <div className="k">Total</div>
            </div>
            <div>
              <div className="v">{squad.overallRank ? squad.overallRank.toLocaleString("en-GB") : "—"}</div>
              <div className="k">Rank</div>
            </div>
            <div>
              <div className="v">£{squad.bankM.toFixed(1)}m</div>
              <div className="k">Bank</div>
            </div>
            <div>
              <div className="v">£{squad.valueM.toFixed(1)}m</div>
              <div className="k">Value</div>
            </div>
            {squad.activeChip && (
              <div>
                <div className="v accent">{squad.activeChip}</div>
                <div className="k">Chip</div>
              </div>
            )}
          </div>
        </section>
        <Workspace squad={squad} initialQuestion={initialQuestion} />
      </>
    );
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      return <Problem title="No team with that ID" body={`FPL has no team ${teamId}. Check the number in your Points page address.`} />;
    }
    if (error instanceof FplUnavailableError) {
      return <Problem title="FPL is not answering" body="The FPL API is busy or updating — usually while a gameweek is being scored. Try again in a few minutes." />;
    }
    return <Problem title="Something went wrong" body="We could not load this team right now. Try again in a moment." />;
  }
}
