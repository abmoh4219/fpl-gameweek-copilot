"use client";

import { useEffect, useState } from "react";

export interface DeadlineItem {
  gameweek: number;
  deadlineUtc: string;
}

/** "GW11 deadline in 1d 4h": the next deadline still ahead, ticking once a minute. Null in the off-season. */
export function DeadlineCountdown({ deadlines, withTime = false }: { deadlines: DeadlineItem[]; withTime?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (now === null) return null;
  const next = deadlines.find((d) => new Date(d.deadlineUtc).getTime() > now);
  if (!next) return null;
  const at = new Date(next.deadlineUtc);
  const mins = Math.max(0, Math.floor((at.getTime() - now) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const left = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const soon = mins < 24 * 60;
  return (
    <span className={`countdown${soon ? " soon" : ""}`}>
      GW{next.gameweek} deadline in <b>{left}</b>
      {withTime && (
        <span className="countdown-at">
          {" "}
          · {at.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </span>
  );
}
