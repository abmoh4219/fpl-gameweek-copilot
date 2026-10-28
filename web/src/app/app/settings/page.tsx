import type { Metadata } from "next";
import Link from "next/link";
import { AGENT_LIMITS } from "@fpl/shared";
import { createAuthClient, getViewer } from "@/lib/auth/server";
import { DeleteAccount } from "./DeleteAccount";

export const metadata: Metadata = { title: "Settings" };

const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function Settings() {
  const viewer = await getViewer();
  if (!viewer?.profile) return null;
  const supabase = await createAuthClient();
  const [{ data: usage }, { data: since }] = await Promise.all([
    supabase.from("my_usage_total").select("questions").limit(1),
    supabase.from("my_profile").select("created_at").limit(1),
  ]);
  const used = (usage?.[0] as { questions: number } | undefined)?.questions ?? 0;
  const limit = AGENT_LIMITS.questionsPerAccount;
  const created = (since?.[0] as { created_at: string } | undefined)?.created_at;

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <span className="page-kicker">Settings</span>
          <h1 className="page-title">
            Your <em>account</em>
          </h1>
        </div>
      </header>

      <section className="setting">
        <div className="setting-label">
          <h2>Account</h2>
          <p>How you sign in to Armband.</p>
        </div>
        <dl className="setting-list">
          {viewer.name && (
            <div>
              <dt>Name</dt>
              <dd>{viewer.name}</dd>
            </div>
          )}
          <div>
            <dt>Email</dt>
            <dd>{viewer.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Signs in with</dt>
            <dd>{viewer.provider === "google" ? "Google" : "Email and password"}</dd>
          </div>
          {created && (
            <div>
              <dt>Member since</dt>
              <dd>{fmtDate.format(new Date(created))}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>FPL team</h2>
          <p>The team the Gaffer reads. Read-only: we can never change it.</p>
        </div>
        <div>
          <dl className="setting-list">
            <div>
              <dt>Team</dt>
              <dd>{viewer.profile.team_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{viewer.profile.manager_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Team ID</dt>
              <dd className="mono">{viewer.profile.fpl_team_id}</dd>
            </div>
          </dl>
          <Link href="/onboarding?change=1" className="btn">
            Change team
          </Link>
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>The Gaffer</h2>
          <p>Every account includes {limit} questions. They don&apos;t reset — the demo and your squad view stay free.</p>
        </div>
        <div className="usage">
          <div className="usage-top">
            <b>{Math.min(used, limit)}</b> of {limit} questions used
          </div>
          <div className="usage-bar" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
            <i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>Session</h2>
          <p>Sign out of Armband on this device.</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </section>

      <section className="setting danger">
        <div className="setting-label">
          <h2>Delete account</h2>
          <p>Removes your login, your connected team and your usage history. Your FPL team itself is untouched.</p>
        </div>
        <DeleteAccount />
      </section>
    </div>
  );
}
