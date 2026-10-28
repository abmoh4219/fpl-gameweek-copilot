import Link from "next/link";
import { Logo } from "./Logo";

export const TELEGRAM_URL = "https://t.me/fpl_gw_copilot";
export const DEMO_TEAM_ID = 7653564;

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Gameweek Copilot home">
          <Logo />
          <span className="brand-name">Gameweek Copilot</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/#how" className="hide-sm">How it works</Link>
          <Link href="/#guide" className="hide-sm">Guide</Link>
          <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="hide-sm">Telegram</a>
          <Link href={`/team/${DEMO_TEAM_ID}`} className="btn" style={{ height: 34, padding: "0 12px", fontSize: 13 }}>
            Demo team
          </Link>
        </nav>
      </div>
    </header>
  );
}
