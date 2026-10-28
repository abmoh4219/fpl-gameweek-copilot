"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "./Mark";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="wrap">
        <Link href="/" className="mark" aria-label="Gameweek Copilot home">
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
          <Link href="/sign-in" className="nav-login hide-mobile">
            Log in
          </Link>
          <Link href="/sign-up" className="btn btn-accent">
            Get started
          </Link>
        </div>
      </div>
      <span className="scroll-progress" aria-hidden="true" />
    </header>
  );
}
