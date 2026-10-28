import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";
import { ConnectTeam } from "./ConnectTeam";

export const metadata: Metadata = { title: "Connect your team" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/onboarding");
  const changing = (await searchParams).change === "1";
  const current = viewer.profile?.fpl_team_id ?? null;
  if (current && !changing) redirect("/app");

  return (
    <div className="auth-card">
      {changing ? (
        <span className="auth-kicker">Settings · change team</span>
      ) : (
        <ol className="steps-mini" aria-label="Getting started">
          <li className="done">Account</li>
          <li className="on">Your team</li>
          <li>Kick-off</li>
        </ol>
      )}
      <h1 className="auth-title">
        {changing ? (
          <>
            Switch to <em>another team</em>
          </>
        ) : (
          <>
            Now, <em>your team.</em>
          </>
        )}
      </h1>
      <p className="auth-sub">
        We only read your public team — we can&apos;t make transfers or change anything, and we never ask for your FPL
        password.
      </p>
      <ConnectTeam current={current} />
      {changing && (
        <p className="auth-switch">
          <Link href="/app/settings">Cancel and keep {viewer.profile?.team_name ?? "my current team"}</Link>
        </p>
      )}
    </div>
  );
}
