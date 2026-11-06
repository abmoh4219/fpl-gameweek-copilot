import type { Metadata } from "next";
import Link from "next/link";
import { Dugout } from "@/components/copilot/Dugout";
import { SquadCheck } from "@/components/copilot/SquadCheck";
import { DEMO_TEAM_ID } from "@/components/site/links";
import { TeamShell } from "@/components/team/TeamShell";
import { gafferData } from "@/lib/gaffer";
import { loadSquad } from "@/lib/squad";

export const metadata: Metadata = {
  title: "Demo",
  description: "A real FPL squad on the pitch with the Gaffer's five free checks: best XI, lineup rating, captain, transfers and injuries. No account needed.",
};

// The squad comes from FPL through our cache; the checks are computed by code on each render.
export const revalidate = 900;

export default async function Demo() {
  const squad = await loadSquad(DEMO_TEAM_ID).catch(() => null);
  const gaffer = squad ? await gafferData(squad).catch(() => null) : null;

  return (
    <TeamShell
      plate="Demo"
      action={
        <Link href="/team" className="btn btn-accent">
          Try it on your team
        </Link>
      }
    >
      <header className="page-head">
        <span className="page-kicker">Demo · a real FPL team</span>
        <h1 className="page-title">
          Take a look <em>around</em>
        </h1>
        <p className="page-sub">
          This is {squad ? `${squad.teamName}, managed by ${squad.managerName}` : "a real FPL team"}. Tap any player for
          their card, and run the Gaffer&apos;s checks to see the numbers behind each answer.
        </p>
      </header>

      {squad ? (
        <>
          <Dugout squad={squad} gaffer={gaffer} mode="demo" />
          <SquadCheck squad={squad} />
        </>
      ) : (
        <div className="notice error">FPL isn&apos;t answering right now — it pauses while a gameweek is being scored. Try again in a few minutes.</div>
      )}
    </TeamShell>
  );
}
