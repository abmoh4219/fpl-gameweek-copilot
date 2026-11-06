import type { Metadata } from "next";
import Link from "next/link";
import { createAuthClient, getViewer } from "@/lib/auth/server";
import { DeleteAccount } from "./DeleteAccount";

export const metadata: Metadata = { title: "Settings" };

const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function Settings() {
  const viewer = await getViewer();
  if (!viewer?.profile) return null;
  const supabase = await createAuthClient();
  const { data: since } = await supabase.from("my_profile").select("created_at").limit(1);
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
          <p>Removes your login and your connected team. Your FPL team itself is untouched.</p>
        </div>
        <DeleteAccount />
      </section>
    </div>
  );
}
