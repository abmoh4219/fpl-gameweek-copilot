"use client";

import { useEffect, useState } from "react";
import { squadChanges, squadSnapshot, type Squad, type SquadChange, type SquadSnapshot, type WatchRow } from "@fpl/shared";

/**
 * Tonight for your squad, and what changed since your last visit
 * (ADR-0019). The last-visit snapshot lives in this browser only. A new
 * baseline is taken once the previous visit is three hours old, so a refresh
 * never wipes what you came back to see.
 */
const NEW_VISIT_MS = 3 * 3600_000;

const STATUS: Record<string, string> = { d: "doubtful", i: "injured", s: "suspended", u: "unavailable", n: "not in the squad" };

function describe(c: SquadChange): { text: string; tone: "up" | "down" | "warn" | "plain" } {
  switch (c.kind) {
    case "price":
      return { text: `${c.name} £${c.from.toFixed(1)}m → £${c.to.toFixed(1)}m`, tone: c.to > c.from ? "up" : "down" };
    case "flagged":
      return { text: `${c.name} flagged ${STATUS[c.status] ?? "by FPL"}${c.chance !== null ? `, ${c.chance}% to play` : ""}`, tone: "warn" };
    case "cleared":
      return { text: `${c.name} is fit again`, tone: "up" };
    case "chance":
      return { text: `${c.name} ${c.from ?? "?"}% → ${c.to ?? "?"}% to play`, tone: "warn" };
    case "joined":
      return { text: `${c.name} joined your squad`, tone: "plain" };
    case "left":
      return { text: `${c.name} left your squad`, tone: "plain" };
  }
}

function ago(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 24 ? `${Math.max(h, 1)}h ago` : `${Math.round(h / 24)}d ago`;
}

export function SquadWatch({ squad, tonight }: { squad: Squad; tonight: WatchRow[] }) {
  const [since, setSince] = useState<{ at: string; changes: SquadChange[] } | null | "first">(null);

  useEffect(() => {
    const key = `armband:squad:${squad.entryId}`;
    const now = squadSnapshot(squad, new Date().toISOString());
    try {
      const raw = window.localStorage.getItem(key);
      const stored = raw ? (JSON.parse(raw) as { base: SquadSnapshot; cur: SquadSnapshot }) : null;
      let base = stored?.base ?? null;
      if (stored?.cur && Date.now() - new Date(stored.cur.at).getTime() >= NEW_VISIT_MS) base = stored.cur;
      window.localStorage.setItem(key, JSON.stringify({ base: base ?? now, cur: now }));
      setSince(base ? { at: base.at, changes: squadChanges(base, now) } : "first");
    } catch {
      setSince("first");
    }
  }, [squad]);

  return (
    <div className="sq-row">
      <section className="sq-panel" aria-label="Tonight for your squad">
        <h2>
          Tonight <small>price watch, an estimate</small>
        </h2>
        {tonight.length === 0 ? (
          <p className="sq-quiet">None of your fifteen is close to a price change tonight.</p>
        ) : (
          <ul>
            {tonight.map((r) => (
              <li key={r.fplId}>
                <span>{r.webName}</span>
                <b className={r.direction === "rising" ? "up" : "down"}>
                  {Math.abs(r.percent) >= 100 ? "100%+" : `${Math.round(Math.abs(r.percent))}%`} toward a {r.direction === "rising" ? "rise" : "fall"}
                </b>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="sq-panel" aria-label="Since your last visit">
        <h2>
          Since your last visit {since && since !== "first" && <small>{ago(since.at)}</small>}
        </h2>
        {since === null ? null : since === "first" ? (
          <p className="sq-quiet">Come back after the next update and price moves, injury news and squad changes show here.</p>
        ) : since.changes.length === 0 ? (
          <p className="sq-quiet">Nothing has changed for your fifteen.</p>
        ) : (
          <ul>
            {since.changes.map((c, i) => {
              const d = describe(c);
              return (
                <li key={i} className={d.tone}>
                  <span>{d.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
