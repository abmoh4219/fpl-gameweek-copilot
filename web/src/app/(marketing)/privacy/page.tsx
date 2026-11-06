import type { Metadata } from "next";
import { TELEGRAM_URL } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Armband stores about you, why, and how to delete it.",
};

const UPDATED = "6 November 2026";

/**
 * Written to match what the code actually does: the tables in
 * supabase/migrations, the agent route, and the plan kept in the browser.
 * Change this page whenever any of those change.
 */
export default function Privacy() {
  return (
    <article className="legal wrap">
      <span className="legal-kicker">Last updated {UPDATED}</span>
      <h1>
        Privacy, <em>plainly</em>
      </h1>
      <p className="legal-lede">
        Armband stores nothing about you. Here is what that means in practice.
      </p>

      <h2>What we store about you</h2>
      <p>
        Nothing. Armband has no accounts. To see your squad you enter your public FPL team ID; we use it to read your
        team from FPL and do not save it. We never ask for your FPL password, and Armband can only read your team — it
        cannot make transfers or change anything in FPL.
      </p>

      <h2>What stays in your browser</h2>
      <ul>
        <li>
          <b>Your team.</b> If you choose &ldquo;This is my team&rdquo;, its ID and name are kept in your own browser so
          &ldquo;My team&rdquo; opens it next time.
        </li>
        <li>
          <b>Plans you apply.</b> A lineup or transfer plan you apply is kept in your own browser, not on our servers.
        </li>
        <li>
          <b>Your theme.</b> Light or dark.
        </li>
      </ul>
      <p>
        Clear them any time with your browser&apos;s site data, or <b>Clear plan</b> on your team page.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>
          <b>No tracking.</b> No advertising, no analytics trackers, no selling or sharing of data, no cookies.
        </li>
        <li>
          <b>No AI on your squad.</b> The Gaffer&apos;s checks run on our server from your public FPL team, and the
          results are not saved.
        </li>
      </ul>

      <h2>Accounts made before 6 November 2026</h2>
      <p>
        Armband used to have sign-in. If you made an account then, its email address, name, connected team ID and, if
        you used the old AI Gaffer, a one-way fingerprint of your email with a question count are still in our database
        until we delete all of them. To have yours removed sooner, ask us on Telegram (below).
      </p>

      <h2>Who processes data</h2>
      <p>
        Armband runs on <b>Vercel</b> (the website) and <b>Supabase</b> (the football database). Football data comes
        from Fantasy Premier League&apos;s public data and football-data.org.
      </p>

      <h2>Questions</h2>
      <p>
        Ask us on <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram</a>.
      </p>

      <p className="legal-note">
        Armband is an independent project, not affiliated with, endorsed by or connected to the Premier League or Fantasy
        Premier League.
      </p>
    </article>
  );
}
