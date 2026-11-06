import Link from "next/link";
import { Mark, Wordmark } from "./Mark";
import { GITHUB_URL, PORTFOLIO_URL, TELEGRAM_URL } from "./links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-cols">
          <div>
            <Link href="/" className="mark">
              <Mark />
              <Wordmark />
            </Link>
            <p className="muted" style={{ maxWidth: 360, marginTop: 14, fontSize: 14 }}>
              Free, open-source tools for Fantasy Premier League. Every number computed, every working shown.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="/#features">Features</a></li>
              <li><Link href="/players">Players</Link></li>
              <li><Link href="/stats">Stats</Link></li>
              <li><Link href="/fixtures">Fixture planner</Link></li>
              <li><Link href="/prices">Price watch</Link></li>
              <li><a href="/#gaffer">The Gaffer</a></li>
              <li><Link href="/demo">Demo</Link></li>
              <li><a href="/#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4>Your team</h4>
            <ul>
              <li><Link href="/team">Find your team</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms">Terms</Link></li>
            </ul>
          </div>
          <div>
            <h4>Open source</h4>
            <ul>
              <li><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a></li>
              <li><a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">Contribute</a></li>
              <li><a href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram channel</a></li>
            </ul>
          </div>
        </div>
        <p className="footer-legal">
          Armband is an independent project. Not affiliated with, endorsed by or connected to the Premier League or
          Fantasy Premier League. Uses public data only, with its own visuals — the club kits shown on the pitch belong
          to their clubs. Fixture runs, goal threat, captain picks and price movements are estimates, never guarantees.
        </p>
        <div className="footer-base">
          <span>
            © {new Date().getFullYear()} Armband · Free &amp; open source (
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT</a>) · Built by{" "}
            <a href={PORTFOLIO_URL} target="_blank" rel="noreferrer">Abdelah</a>
          </span>
          <span>Data refreshed every three hours</span>
        </div>
      </div>
    </footer>
  );
}
