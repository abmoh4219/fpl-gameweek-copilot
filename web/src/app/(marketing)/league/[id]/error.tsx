"use client";

import "./league.css";

/**
 * FPL didn't answer while this league was being read. The error is thrown, not
 * rendered, so it is never cached and the next visit asks FPL again (ADR-0025).
 */
export default function LeagueError() {
  return (
    <section className="block league-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Mini-league spy</h1>
          <p>FPL isn&apos;t answering right now (it pauses while a gameweek is being scored). Try again in a minute.</p>
        </header>
      </div>
    </section>
  );
}
