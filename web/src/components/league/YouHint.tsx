"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readMyTeam, type MyTeam } from "@/lib/my-team";

/** On a league page without "you": offer your remembered team, for your differentials. */
export function YouHint({ league }: { league: number }) {
  const [mine, setMine] = useState<MyTeam | null>(null);
  useEffect(() => setMine(readMyTeam()), []);
  if (!mine) return null;
  return (
    <p className="tool-share">
      <Link href={`/league/${league}?me=${mine.id}`}>Show {mine.name}&apos;s differentials in this league</Link>
    </p>
  );
}
