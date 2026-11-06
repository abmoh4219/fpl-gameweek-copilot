import type { Metadata } from "next";
import { LeagueIdBox } from "@/components/league/LeagueIdBox";

export const metadata: Metadata = {
  title: "Mini-league spy",
  description: "See your FPL mini-league's captains, chips and most-owned players, and your differentials against your rivals. Free, no sign-up.",
};

export default function LeagueFinder() {
  return (
    <section className="block league-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Mini-league spy</h1>
          <p>Your league&apos;s captains, chips and most-owned players this gameweek, and how your team differs from your rivals&apos;</p>
        </header>
        <LeagueIdBox />
      </div>
    </section>
  );
}
