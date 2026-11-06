"use client";

import { useEffect, useState } from "react";
import { readMyTeam, saveMyTeam } from "@/lib/my-team";

/** "This is my team": remembers a team in this browser, so "My team" opens it next time. */
export function RememberTeam({ id, name }: { id: number; name: string }) {
  const [mine, setMine] = useState<boolean | null>(null);
  useEffect(() => setMine(readMyTeam()?.id === id), [id]);
  if (mine === null) return null;
  return mine ? (
    <span className="remember on">Your team, remembered in this browser</span>
  ) : (
    <button
      type="button"
      className="remember"
      onClick={() => {
        saveMyTeam({ id, name });
        setMine(true);
      }}
    >
      This is my team
    </button>
  );
}
