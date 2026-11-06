import type { Metadata } from "next";
import Link from "next/link";
import { TELEGRAM_URL } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Armband, in plain words.",
};

const UPDATED = "6 November 2026";

export default function Terms() {
  return (
    <article className="legal wrap">
      <span className="legal-kicker">Last updated {UPDATED}</span>
      <h1>
        Terms, <em>plainly</em>
      </h1>
      <p className="legal-lede">
        Armband is a free, independent tool for Fantasy Premier League managers. By using it you agree to these terms.
      </p>

      <h2>What Armband is</h2>
      <p>
        Armband reads your public FPL team, shows it with numbers computed from public football data, and offers the
        Gaffer, a set of checks that suggest lineup, captain and transfer changes. It is in early access: features may change, pause or be removed, and
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
      <p>
        Do not overload the service or scrape it. The code is open source: to run Armband at scale, run your own copy.
        What we store (nothing about you) is set out on the <Link href="/privacy">privacy page</Link>.
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
