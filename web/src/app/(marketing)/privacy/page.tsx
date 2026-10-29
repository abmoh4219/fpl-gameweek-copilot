import type { Metadata } from "next";
import Link from "next/link";
import { TELEGRAM_URL } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Armband stores about you, why, and how to delete it.",
};

const UPDATED = "28 October 2026";

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
        Privacy, <em>plainly.</em>
      </h1>
      <p className="legal-lede">
        Armband keeps as little about you as it can. Here is everything it stores, why, and how to remove it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <b>Your login.</b> Your email address, and your name if you give one or sign in with Google. With email sign-in,
          your password is stored by our authentication provider as a one-way hash — we never see it.
        </li>
        <li>
          <b>Your FPL team.</b> The team ID you connect, with the team name and manager name FPL shows publicly for it.
        </li>
        <li>
          <b>A question counter.</b> How many questions your account has asked the Gaffer, by day, so the limit holds.
        </li>
        <li>
          <b>An email fingerprint.</b> A one-way, keyed hash of your email address with the number of questions it has
          used. It cannot be turned back into your address. It exists so the five free questions cannot be reset by
          deleting an account and signing up again.
        </li>
      </ul>
      <p>
        That is all. We never ask for your FPL password, and Armband can only read your team — it cannot make transfers or
        change anything in FPL.
      </p>

      <h2>What we do not store</h2>
      <ul>
        <li>
          <b>Your questions and the answers.</b> They are processed to answer you and not saved. The Gaffer runs on
          Anthropic&apos;s Claude, which receives your question and your squad to produce the answer.
        </li>
        <li>
          <b>Plans you apply.</b> A lineup or transfer plan you apply is kept in your own browser, not on our servers.
        </li>
        <li>
          <b>Tracking.</b> No advertising, no analytics trackers, no selling or sharing of your data. Cookies are only used
          to keep you signed in.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <p>
        Armband runs on <b>Supabase</b> (database and sign-in), <b>Vercel</b> (the website), <b>Hugging Face</b> (the
        Gaffer&apos;s service), <b>Anthropic</b> (the Gaffer&apos;s answers) and, if you choose it, <b>Google</b> (sign-in).
        Football data comes from Fantasy Premier League&apos;s public data and football-data.org.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Go to <Link href="/app/settings">Settings</Link> and choose <b>Delete account</b>. Your login, connected team and
        question history are deleted immediately and permanently. The only thing kept is the email fingerprint above —
        a hash and a count, nothing that identifies you. To clear an applied plan, use <b>Clear plan</b> or your
        browser&apos;s site data.
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
