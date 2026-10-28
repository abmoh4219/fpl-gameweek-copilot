import type { Metadata } from "next";
import Link from "next/link";
import { Dugout } from "@/components/copilot/Dugout";
import { SquadCheck } from "@/components/copilot/SquadCheck";
import { Mark, Wordmark } from "@/components/site/Mark";
import { DEMO_TEAM_ID } from "@/components/site/links";
import { DEMO_QUESTIONS } from "@/lib/demo";
import { loadSquad } from "@/lib/squad";
import "../app/app.css";

export const metadata: Metadata = {
  title: "Demo",
  description: "Explore a real FPL squad with the Gaffer, Armband's AI manager — no account needed.",
};

// The squad comes from FPL through our cache; the answers are recorded once a gameweek.
export const revalidate = 900;

export default async function Demo() {
  const squad = await loadSquad(DEMO_TEAM_ID).catch(() => null);

  return (
    <div className="demo">
      <header className="demo-bar">
        <Link href="/" className="mark" aria-label="Armband home">
          <Mark size={26} />
          <Wordmark />
        </Link>
        <span className="demo-plate">Demo</span>
        <div className="demo-bar-actions">
          <Link href="/sign-in" className="nav-quiet">
            Log in
          </Link>
          <Link href="/sign-up" className="btn btn-accent">
            Try it on your team
          </Link>
        </div>
      </header>

      <main className="page" id="content">
        <header className="page-head">
          <span className="page-kicker">Demo · a real FPL team</span>
          <h1 className="page-title">
            Take a look <em>around.</em>
          </h1>
          <p className="page-sub">
            This is {squad ? `${squad.teamName}, managed by ${squad.managerName}` : "a real FPL team"}. Tap any player for
            their card, and give the Gaffer a job to see how it works it out.
          </p>
        </header>

        {squad ? (
          <>
            <Dugout squad={squad} mode="demo" questions={DEMO_QUESTIONS} />
            <SquadCheck squad={squad} />
          </>
        ) : (
          <div className="notice error">FPL isn&apos;t answering right now — it pauses while a gameweek is being scored. Try again in a few minutes.</div>
        )}
      </main>
    </div>
  );
}
