import Link from "next/link";
import { Mark, Wordmark } from "@/components/site/Mark";
import "./auth.css";

/**
 * Sign-in, sign-up and onboarding: the form on the left, a floodlit panel on
 * the right with the promise in three lines. The panel hides on small screens.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-main">
        <header className="auth-top">
          <Link href="/" className="mark" aria-label="Armband home">
            <Mark />
            <Wordmark />
          </Link>
          <Link href="/" className="auth-back">
            ← Back to site
          </Link>
        </header>
        <main className="auth-body" id="content">
          {children}
        </main>
        <footer className="auth-foot">
          Independent project · not affiliated with the Premier League or Fantasy Premier League
        </footer>
      </div>

      <aside className="auth-side" aria-hidden="true">
        <div className="floodlights">
          <i className="beam left" />
          <i className="beam right" />
        </div>
        <svg className="auth-chalk" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
          <circle cx="300" cy="400" r="150" />
          <path d="M0 400 H600" />
          <circle cx="300" cy="400" r="4" />
          <path d="M150 0 V110 H450 V0" />
          <path d="M150 800 V690 H450 V800" />
        </svg>
        <div className="auth-armband">
          <svg viewBox="0 0 36 32">
            <path d="M7 6 H34.5 L29.5 26 H2 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M5.8 10.2 H33 M3.6 21.8 H30.6" stroke="var(--accent-ink)" strokeWidth="1.3" opacity="0.4" />
            <path d="M21.6 12.4 A5 5 0 1 0 21.6 19.6" fill="none" stroke="var(--accent-ink)" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="auth-pitch-copy">
          <p className="auth-quote">
            The captain&apos;s call,
            <br />
            <em>with the numbers behind it.</em>
          </p>
          <ul>
            <li>Your fifteen in their kits, with form, minutes and fixtures</li>
            <li>The Gaffer: your XI, transfers and captain, every lookup shown</li>
            <li>Estimates labelled as estimates. Always.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
