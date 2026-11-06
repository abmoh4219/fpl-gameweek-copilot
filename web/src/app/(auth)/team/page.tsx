import type { Metadata } from "next";
import { FindTeam } from "./FindTeam";

export const metadata: Metadata = {
  title: "Find your team",
  description: "Enter your FPL team ID to see your squad on the pitch with the Gaffer's five free checks. No sign-up, no FPL password.",
};

export default function FindYourTeam() {
  return (
    <div className="auth-card">
      <span className="auth-kicker">No sign-up · free</span>
      <h1 className="auth-title">
        Find <em>your team</em>
      </h1>
      <p className="auth-sub">
        We only read your public team. We can&apos;t make transfers or change anything, we never ask for your FPL
        password, and your team is remembered in this browser only.
      </p>
      <FindTeam />
    </div>
  );
}
