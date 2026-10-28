import Link from "next/link";
import { Mark, Wordmark } from "./Mark";
import { TELEGRAM_URL } from "./links";

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
              Your Fantasy Premier League team, with a co-pilot that does the homework — and shows its working.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="/#features">Features</a></li>
              <li><a href="/#how">How it works</a></li>
              <li><Link href="/demo">Demo</Link></li>
              <li><a href="/#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul>
              <li><Link href="/sign-in">Log in</Link></li>
              <li><Link href="/sign-up">Create account</Link></li>
            </ul>
          </div>
          <div>
            <h4>Community</h4>
            <ul>
              <li><a href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram channel</a></li>
            </ul>
          </div>
        </div>
        <p className="footer-legal">
          Armband is an independent project. Not affiliated with, endorsed by or connected to the Premier League or
          Fantasy Premier League. Uses public data only, with its own visuals — the club kits shown on the pitch belong
          to their clubs. Fixture runs, goal threat, captain picks and price movements are estimates, never guarantees.
        </p>
        <div className="footer-giant" aria-hidden="true">
          Armband
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Armband</span>
          <span>Data refreshed every three hours</span>
        </div>
      </div>
    </footer>
  );
}
