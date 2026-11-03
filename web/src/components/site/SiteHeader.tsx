"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserAuthClient } from "@/lib/auth/browser";
import { GitHubIcon } from "./GitHubIcon";
import { compactCount } from "@/lib/github";
import { GITHUB_URL } from "./links";
import { Mark, Wordmark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";

/** Below this the count reads as "nobody uses it", so the pill shows "Star" alone. */
const SHOW_STARS_FROM = 10;

const NAV = [
  ["/players", "Players"],
  ["/stats", "Stats"],
  ["/fixtures", "Fixtures"],
  ["/prices", "Prices"],
  ["/demo", "Demo"],
] as const;

export function SiteHeader({ stars }: { stars: number | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Read from this browser's own session cookie — no network call, and the
  // landing page stays a cached static page for everyone.
  useEffect(() => {
    void createBrowserAuthClient()
      .auth.getSession()
      .then(({ data }) => setSignedIn(data.session !== null));
  }, []);
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
          <ThemeToggle />
          <a
            href={GITHUB_URL}
            className="gh-pill"
            target="_blank"
            rel="noreferrer"
            aria-label="Star Armband on GitHub"
          >
            <span>
              <GitHubIcon size={16} />
              <span className="hide-mobile">Star</span>
            </span>
            {stars !== null && stars >= SHOW_STARS_FROM && (
              <span className="gh-count">
                <span className="gh-star" aria-hidden="true">★</span>
                {compactCount(stars)}
              </span>
            )}
          </a>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          {signedIn ? (
            <Link href="/app" className="btn btn-accent">
              Open app
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="nav-login hide-mobile">
                Log in
              </Link>
              <Link href="/sign-up" className="btn btn-accent">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
      {menuOpen && (
        <nav id="site-menu" className="menu-panel" aria-label="Menu">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </Link>
          ))}
          <Link href={signedIn ? "/app" : "/sign-in"} onClick={() => setMenuOpen(false)}>
            {signedIn ? "Open app" : "Log in"}
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="menu-gh">
            <GitHubIcon size={16} /> Star on GitHub
          </a>
        </nav>
      )}
      <span className="scroll-progress" aria-hidden="true" />
    </header>
  );
}
