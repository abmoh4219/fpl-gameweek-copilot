import type { Squad, SquadPlayer } from "./squad.ts";

/**
 * Gameweek wrapped (ADR-0020): one manager's gameweek, told with FPL's own
 * numbers. Hindsight, never advice: "your best captain would have been" is a
 * fact about points already scored.
 */
export interface GameweekWrapped {
  gameweek: number;
  /** FPL's gameweek points, before transfer hits. */
  points: number;
  /** After hits: what actually counts. */
  net: number;
  /** FPL's average for the gameweek; null if we don't have it. */
  average: number | null;
  captain: { name: string; points: number; multiplier: number } | null;
  /** The starter whose points, doubled (or tripled), would have scored most. */
  bestCaptain: { name: string; points: number; isYours: boolean } | null;
  benchPoints: number;
  transfers: number;
  hits: number;
  overallRank: number | null;
  /** Places gained since last gameweek (negative = dropped); null on a first gameweek or without history. */
  rankMove: number | null;
  chip: string | null;
  /** The gameweek's top scorer in the XI, before the armband. */
  topScorer: { name: string; points: number } | null;
}

const CHIP: Record<string, string> = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard", manager: "Assistant Manager" };

export function chipName(chip: string | null): string | null {
  return chip ? (CHIP[chip] ?? chip) : null;
}

export function gameweekWrapped(
  squad: Squad,
  extra: { average?: number | null; previousOverallRank?: number | null } = {},
): GameweekWrapped {
  const starters = squad.starters;
  const captain = starters.find((p) => p.isCaptain) ?? null;
  const multiplier = captain && captain.multiplier > 1 ? captain.multiplier : squad.activeChip === "3xc" ? 3 : 2;
  const best = [...starters].sort((a: SquadPlayer, b: SquadPlayer) => b.eventPoints - a.eventPoints || a.webName.localeCompare(b.webName))[0] ?? null;
  const prev = extra.previousOverallRank ?? null;
  return {
    gameweek: squad.gameweek,
    points: squad.gameweekPoints,
    net: squad.gameweekPoints - squad.transfersCost,
    average: extra.average ?? null,
    captain: captain ? { name: captain.webName, points: captain.eventPoints * multiplier, multiplier } : null,
    bestCaptain: best ? { name: best.webName, points: best.eventPoints * multiplier, isYours: best.fplId === captain?.fplId || best.eventPoints === captain?.eventPoints } : null,
    benchPoints: squad.benchPoints,
    transfers: squad.transfers,
    hits: squad.transfersCost,
    overallRank: squad.overallRank,
    rankMove: prev !== null && squad.overallRank !== null ? prev - squad.overallRank : null,
    chip: chipName(squad.activeChip),
    topScorer: best ? { name: best.webName, points: best.eventPoints } : null,
  };
}
