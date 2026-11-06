"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitHubIcon } from "./GitHubIcon";
import { compactCount } from "@/lib/github";
import { readMyTeam, type MyTeam } from "@/lib/my-team";
import { GITHUB_URL } from "./links";
import { Mark, Wordmark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";

/** Below this the count reads as "nobody uses it", so the pill shows "Star" alone. */
const SHOW_STARS_FROM = 10;

const NAV = [
  ["/stats", "Stats"],
  ["/fixtures", "Fixtures"],
  ["/prices", "Prices"],
  ["/players", "Players"],
] as const;

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Search any player from every page: a plain GET form, so it needs no script and costs nothing. */
function HeaderSearch({ id }: { id: string }) {
  return (
    <form action="/players" method="get" role="search" className="hd-search">
      <label htmlFor={id} className="sr-only">
        Search players
      </label>
      <SearchIcon />
      <input id={id} name="q" type="search" placeholder="Search players" autoComplete="off" maxLength={40} />
    </form>
  );
}

export function SiteHeader({ stars }: { stars: number | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [myTeam, setMyTeam] = useState<MyTeam | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // The remembered team lives in this browser (no accounts, ADR-0017), so the
  // landing page stays a cached static page for everyone.
  useEffect(() => {
    const sync = () => setMyTeam(readMyTeam());
    sync();
    window.addEventListener("armband:my-team", sync);
    return () => window.removeEventListener("armband:my-team", sync);
  }, []);
  const teamHref = myTeam ? `/team/${myTeam.id}` : "/team";
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="wrap">
        <Link href="/" className="mark" aria-label="Armband home">
          <Mark />
          <Wordmark />
        </Link>
        <nav className="site-nav" aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="site-actions">
          <HeaderSearch id="hd-q" />
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <span className="hd-theme">
            <ThemeToggle />
          </span>
          <Link href={teamHref} className="btn btn-accent btn-sm">
            My team
          </Link>
        </div>
      </div>
      {menuOpen && (
        <nav id="site-menu" className="menu-panel" aria-label="Menu">
          <HeaderSearch id="menu-q" />
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </Link>
          ))}
          <div className="menu-row">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="menu-gh">
              <GitHubIcon size={16} /> GitHub{stars !== null && stars >= SHOW_STARS_FROM ? ` · ${compactCount(stars)} stars` : ""}
            </a>
            <ThemeToggle />
          </div>
        </nav>
      )}
      <span className="scroll-progress" aria-hidden="true" />
    </header>
  );
}
