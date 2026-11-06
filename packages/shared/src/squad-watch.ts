import { INSIGHT_CONFIG } from "./insights/config.ts";
import type { WatchRow } from "./prices.ts";
import type { Squad } from "./squad.ts";

/**
 * "Tonight for your squad" and "since your last visit" (ADR-0019). Pure, so
 * the dugout can run them in the browser against a snapshot it keeps there:
 * nothing about a visitor is stored on our side.
 */

/** The fifteen's price watch: who FPL has closest to a change tonight, closest first. An estimate. */
export function squadTonight(squad: Squad, rows: readonly WatchRow[], min: number = INSIGHT_CONFIG.squadWatch.tonightMinPercent): WatchRow[] {
  const ids = new Set([...squad.starters, ...squad.bench].map((p) => p.fplId));
  return rows.filter((r) => ids.has(r.fplId) && Math.abs(r.percent) >= min).sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
}

/** What the browser remembers about a squad between visits. */
export interface SquadSnapshot {
  at: string;
  players: Record<string, { name: string; price: number; status: string; chance: number | null }>;
}

export function squadSnapshot(squad: Squad, at: string): SquadSnapshot {
  const players: SquadSnapshot["players"] = {};
  for (const p of [...squad.starters, ...squad.bench]) players[p.fplId] = { name: p.webName, price: p.priceM, status: p.status, chance: p.chanceOfPlayingNextRound };
  return { at, players };
}

export type SquadChange =
  | { kind: "price"; name: string; from: number; to: number }
  | { kind: "flagged"; name: string; status: string; chance: number | null }
  | { kind: "cleared"; name: string }
  | { kind: "chance"; name: string; from: number | null; to: number | null }
  | { kind: "joined"; name: string }
  | { kind: "left"; name: string };

/** What changed for this squad since the last snapshot: prices, availability, and players in or out. */
export function squadChanges(before: SquadSnapshot, now: SquadSnapshot): SquadChange[] {
  const out: SquadChange[] = [];
  for (const [id, p] of Object.entries(now.players)) {
    const was = before.players[id];
    if (!was) {
      out.push({ kind: "joined", name: p.name });
      continue;
    }
    if (Math.round(was.price * 10) !== Math.round(p.price * 10)) out.push({ kind: "price", name: p.name, from: was.price, to: p.price });
    if (was.status === "a" && p.status !== "a") out.push({ kind: "flagged", name: p.name, status: p.status, chance: p.chance });
    else if (was.status !== "a" && p.status === "a") out.push({ kind: "cleared", name: p.name });
    else if (p.status !== "a" && was.chance !== p.chance) out.push({ kind: "chance", name: p.name, from: was.chance, to: p.chance });
  }
  for (const [id, p] of Object.entries(before.players)) if (!now.players[id]) out.push({ kind: "left", name: p.name });
  return out;
}
