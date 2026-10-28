"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserAuthClient } from "@/lib/auth/browser";
import { Mark, Wordmark } from "./Mark";

export function SiteHeader() {
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
          <a href="/#features">Product</a>
          <a href="/#how">How it works</a>
          <Link href="/demo">Demo</Link>
          <a href="/#faq">FAQ</a>
        </nav>
        <div className="site-actions">
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
