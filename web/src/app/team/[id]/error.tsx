"use client";

import Link from "next/link";
import { TeamShell } from "@/components/team/TeamShell";

/**
 * FPL didn't answer while this team was being read. The error is thrown, not
 * rendered, so it is never cached and the next visit asks FPL again (ADR-0025).
 */
export default function TeamError() {
  return (
    <TeamShell
      action={
        <Link href="/team" className="btn">
          Change team
        </Link>
      }
    >
      <div className="notice error">
        FPL isn&apos;t answering right now — it pauses while a gameweek is being scored. This team will be back in a few minutes.
      </div>
    </TeamShell>
  );
}
