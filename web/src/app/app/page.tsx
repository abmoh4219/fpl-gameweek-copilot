import { AGENT_LIMITS, type Squad } from "@fpl/shared";
import { Dugout } from "@/components/copilot/Dugout";
import { SquadCheck } from "@/components/copilot/SquadCheck";
import { createAuthClient, getViewer } from "@/lib/auth/server";
import { DEMO_QUESTIONS } from "@/lib/demo";
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

export default async function MyTeam({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await getViewer();
  // The layout guarantees both; this keeps TypeScript honest.
  const teamId = viewer?.profile?.fpl_team_id;
  if (!viewer || !teamId) return null;

  const { welcome } = await searchParams;
  const supabase = await createAuthClient();
  const [result, { data: usage }] = await Promise.all([
    squadOrError(teamId),
    supabase.from("my_usage_today").select("questions").limit(1),
  ]);
  const limit = AGENT_LIMITS.questionsPerAccountPerDay;
  const used = (usage?.[0] as { questions: number } | undefined)?.questions ?? 0;
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
          <b>You&apos;re in.</b> {"squad" in result ? `${result.squad.teamName} is connected` : "Your team is connected"} —
          tap any player for their card, or ask the co-pilot a question.
        </div>
      )}

      {"error" in result ? (
        <div className="notice error">{result.error}</div>
      ) : (
        <>
          <Dugout squad={result.squad} mode="live" suggestions={DEMO_QUESTIONS} remaining={Math.max(limit - used, 0)} limit={limit} />
          <SquadCheck squad={result.squad} />
        </>
      )}
    </div>
  );
}
