import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app/AppNav";
import { Mark, Wordmark } from "@/components/site/Mark";
import { TELEGRAM_URL } from "@/components/site/links";
import { getViewer } from "@/lib/auth/server";
import "./app.css";

export const metadata: Metadata = { title: { default: "My team", template: "%s · Armband" }, robots: { index: false } };

/**
 * The signed-in app: a dugout rail on the left (a top bar on phones) and the
 * page. Every /app page needs an account AND a connected team; without a
 * team, onboarding comes first.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/app");
  if (!viewer.profile?.fpl_team_id) redirect("/onboarding");

  const who = viewer.name ?? viewer.profile.manager_name ?? viewer.email ?? "Manager";
  return (
    <div className="app">
      <aside className="app-rail">
        <Link href="/app" className="mark" aria-label="Armband — my team">
          <Mark size={26} />
          <Wordmark />
        </Link>

        <div className="rail-team">
          <span className="rail-team-badge">{(viewer.profile.team_name ?? "?").slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{viewer.profile.team_name ?? "My team"}</b>
            <small>ID {viewer.profile.fpl_team_id}</small>
          </div>
        </div>

        <AppNav telegramUrl={TELEGRAM_URL} />

        <div className="rail-user">
          <span className="rail-avatar" aria-hidden="true">
            {who.slice(0, 1).toUpperCase()}
          </span>
          <div className="rail-user-text">
            <b>{who}</b>
            {viewer.email && <small>{viewer.email}</small>}
          </div>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="rail-out" title="Sign out" aria-label="Sign out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>
      <main className="app-main" id="content">
        {children}
      </main>
    </div>
  );
}
