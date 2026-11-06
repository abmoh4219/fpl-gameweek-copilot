"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseLeagueInput } from "@fpl/shared";
import { readMyTeam } from "@/lib/my-team";

/** Type a league ID or paste its FPL address; your remembered team comes along, for your differentials. */
export function LeagueIdBox() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<number | null>(null);
  useEffect(() => setMe(readMyTeam()?.id ?? null), []);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const id = parseLeagueInput(raw);
    if (id === null) {
      setError("That isn't a league ID. Open the league in FPL and copy the number after /leagues/ in the address.");
      return;
    }
    router.push(`/league/${id}${me ? `?me=${me}` : ""}`);
  }

  return (
    <div className="idbox">
      <form className="idbox-form" onSubmit={open} noValidate>
        <label htmlFor="league-id" className="sr-only">
          League ID
        </label>
        <input id="league-id" className="idbox-input" inputMode="numeric" autoComplete="off" placeholder="League ID or address" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <button type="submit" className="btn btn-accent idbox-go">
          Open league
        </button>
      </form>
      <p className={`idbox-help${error ? " is-error" : ""}`} role={error ? "alert" : undefined}>
        {error ?? "In FPL: Leagues → your league. The number after /leagues/ in the address is its ID. Your team page lists your leagues too."}
      </p>
    </div>
  );
}
