import type { Metadata } from "next";
import Link from "next/link";
import { TELEGRAM_URL } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Armband, in plain words.",
};

const UPDATED = "28 October 2026";

export default function Terms() {
  return (
    <article className="legal wrap">
      <span className="legal-kicker">Last updated {UPDATED}</span>
      <h1>
        Terms, <em>plainly.</em>
      </h1>
      <p className="legal-lede">
        Armband is a free, independent tool for Fantasy Premier League managers. By creating an account you agree to these
        terms.
      </p>

      <h2>What Armband is</h2>
      <p>
        Armband reads your public FPL team, shows it with numbers computed from public football data, and offers a
        the Gaffer, an AI manager that can suggest and plan changes. It is in early access: features may change, pause or be removed, and
        it is provided as it is, without guarantees.
      </p>

      <h2>Estimates, not advice</h2>
      <p>
        Expected points, fixture runs, goal threat, lineup ratings, captain picks and price movements are{" "}
        <b>estimates</b>, labelled as such. They can be wrong. Decisions about your team are yours — it is a game, and
        Armband is not responsible for the points you win or lose.
      </p>

      <h2>Your FPL team</h2>
      <p>
        Armband never asks for your FPL password and cannot change your team. Plans the Gaffer makes stay in Armband
        until you make the changes yourself in the FPL app.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>One account per person. Each account includes five questions to the Gaffer.</li>
        <li>
          Do not try to get around the limits, overload the service, scrape it, or use the Gaffer for anything other than
          Fantasy Premier League.
        </li>
      </ul>
      <p>Accounts that break these rules may be suspended or deleted.</p>

      <h2>Your account</h2>
      <p>
        You can delete your account at any time from <Link href="/app/settings">Settings</Link>. What we store and how we
        handle it is set out in the <Link href="/privacy">privacy page</Link>.
      </p>

      <h2>Not affiliated</h2>
      <p>
        Armband is not affiliated with, endorsed by or connected to the Premier League or Fantasy Premier League. Club kits
        belong to their clubs.
      </p>

      <h2>Changes and questions</h2>
      <p>
        If these terms change, the date above changes with them. Questions: ask us on{" "}
        <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
          Telegram
        </a>
        .
      </p>
    </article>
  );
}
