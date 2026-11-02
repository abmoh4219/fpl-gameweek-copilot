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

export function SiteHeader({ stars }: { stars: number | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

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
          <a href="/#features">Features</a>
          <a href="/#gaffer">The Gaffer</a>
          <Link href="/demo">Demo</Link>
          <a href="/#faq">FAQ</a>
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
      <span className="scroll-progress" aria-hidden="true" />
    </header>
  );
}
