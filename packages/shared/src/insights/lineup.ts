import { INSIGHT_CONFIG } from "./config.ts";
import { round } from "./form.ts";
import type { PlayerCard } from "./player-card.ts";
import { canCaptain, captainScore } from "./selections.ts";

/**
 * Picking and rating a starting XI from a manager's fifteen.
 *
 * The backbone is FPL's own expected points for the next gameweek (ep_next);
 * a player who is ruled out counts as zero. Every result here is an ESTIMATE
 * and is labelled as one wherever it is shown.
 */

export type LineupPosition = "GKP" | "DEF" | "MID" | "FWD";

export interface LineupPlayer {
  fplId: number;
  webName: string;
  position: LineupPosition;
  card: PlayerCard;
}

export interface Lineup {
  starters: number[];
  /** Bench in FPL order: the reserve keeper first, then outfield by priority. */
  bench: number[];
  captain: number;
  vice: number;
}

/** Expected points for next gameweek, with anyone ruled out at zero. */
export function expectedPoints(card: PlayerCard): number {
  const { outStatuses } = INSIGHT_CONFIG.lineup;
  if (outStatuses.includes(card.status) || card.chanceOfPlayingNextRound === 0) return 0;
  return Math.max(card.epNext, 0);
}

/** Expected points of a lineup: starters, with the captain counted twice. */
export function lineupPoints(lineup: Lineup, pool: readonly LineupPlayer[]): number {
  const byId = new Map(pool.map((p) => [p.fplId, p]));
  const sum = lineup.starters.reduce((acc, id) => acc + expectedPoints(byId.get(id)!.card), 0);
  const captain = byId.get(lineup.captain);
  return round(sum + (captain ? expectedPoints(captain.card) : 0), 1);
}

/** FPL's rules for a starting XI and bench. Empty when the lineup is legal. */
export function lineupProblems(lineup: Lineup, pool: readonly LineupPlayer[]): string[] {
  const { formation } = INSIGHT_CONFIG.lineup;
  const byId = new Map(pool.map((p) => [p.fplId, p]));
  const problems: string[] = [];
  const all = [...lineup.starters, ...lineup.bench];

  if (lineup.starters.length !== 11) problems.push(`A lineup needs 11 starters, not ${lineup.starters.length}.`);
  if (lineup.bench.length !== pool.length - 11) problems.push(`The bench needs ${pool.length - 11} players.`);
  if (new Set(all).size !== all.length) problems.push("A player appears twice.");
  for (const id of all) if (!byId.has(id)) problems.push(`Player ${id} is not in this squad.`);
  if (problems.length) return problems;

  const count = (pos: LineupPosition) => lineup.starters.filter((id) => byId.get(id)!.position === pos).length;
  if (count("GKP") !== 1) problems.push("Exactly one goalkeeper must start.");
  for (const pos of ["DEF", "MID", "FWD"] as const) {
    const n = count(pos);
    const { min, max } = formation[pos];
    if (n < min || n > max) problems.push(`${n} ${pos} starting; FPL allows ${min} to ${max}.`);
  }
  if (byId.get(lineup.bench[0]!)?.position !== "GKP") problems.push("The first bench spot is for the reserve goalkeeper.");
  if (!lineup.starters.includes(lineup.captain)) problems.push("The captain must start.");
  if (!lineup.starters.includes(lineup.vice)) problems.push("The vice-captain must start.");
  if (lineup.captain === lineup.vice) problems.push("Captain and vice-captain must be different players.");
  return problems;
}

/** Captain, then vice: the two best captain scores among those who can captain. */
export function pickCaptains(starters: readonly LineupPlayer[]): { captain: number; vice: number } {
  const eligible = starters.filter((p) => canCaptain(p.card) && expectedPoints(p.card) > 0);
  const ranked = (eligible.length >= 2 ? eligible : starters)
    .slice()
    .sort((a, b) => captainScore(b.card) - captainScore(a.card) || expectedPoints(b.card) - expectedPoints(a.card));
  return { captain: ranked[0]!.fplId, vice: ranked[1]!.fplId };
}

/** Order a bench FPL's way: reserve keeper first, then outfield by expected points. */
export function orderBench(bench: readonly LineupPlayer[]): number[] {
  const keeper = bench.filter((p) => p.position === "GKP");
  const outfield = bench
    .filter((p) => p.position !== "GKP")
    .sort((a, b) => expectedPoints(b.card) - expectedPoints(a.card));
  return [...keeper, ...outfield].map((p) => p.fplId);
}

/**
 * The strongest legal XI from a squad: the best keeper, then every legal
 * formation tried with the best players at each position. Fifteen players
 * make this a handful of combinations, so exhaustive search is exact.
 */
export function bestLineup(pool: readonly LineupPlayer[]): Lineup {
  const { formation } = INSIGHT_CONFIG.lineup;
  const ranked = (pos: LineupPosition) =>
    pool.filter((p) => p.position === pos).sort((a, b) => expectedPoints(b.card) - expectedPoints(a.card));
  const [gk, def, mid, fwd] = [ranked("GKP"), ranked("DEF"), ranked("MID"), ranked("FWD")];

  let best: LineupPlayer[] | null = null;
  let bestScore = -1;
  for (let d = formation.DEF.min; d <= formation.DEF.max; d++) {
    for (let m = formation.MID.min; m <= formation.MID.max; m++) {
      const f = 10 - d - m;
      if (f < formation.FWD.min || f > formation.FWD.max) continue;
      if (d > def.length || m > mid.length || f > fwd.length || gk.length === 0) continue;
      const xi = [gk[0]!, ...def.slice(0, d), ...mid.slice(0, m), ...fwd.slice(0, f)];
      const score = xi.reduce((acc, p) => acc + expectedPoints(p.card), 0);
      if (score > bestScore + 1e-9) {
        best = xi;
        bestScore = score;
      }
    }
  }
  if (!best) throw new Error("This squad cannot field a legal XI.");

  const starters = new Set(best.map((p) => p.fplId));
  return {
    starters: best.map((p) => p.fplId),
    bench: orderBench(pool.filter((p) => !starters.has(p.fplId))),
    ...pickCaptains(best),
  };
}

export interface LineupRating {
  /** 0-10, one decimal. An ESTIMATE of how close this XI is to the best the squad can field. */
  rating: number;
  expectedPoints: number;
  bestExpectedPoints: number;
  /** Concrete, code-written reasons, worst first. */
  issues: string[];
  best: Lineup;
}

export function rateLineup(lineup: Lineup, pool: readonly LineupPlayer[]): LineupRating {
  const { floorRatio, noticeGapPoints } = INSIGHT_CONFIG.lineup;
  const byId = new Map(pool.map((p) => [p.fplId, p]));
  const best = bestLineup(pool);
  const mine = lineupPoints(lineup, pool);
  const top = lineupPoints(best, pool);

  const ratio = top > 0 ? mine / top : 1;
  const rating = ratio <= floorRatio ? 0 : round(Math.min(1, (ratio - floorRatio) / (1 - floorRatio)) * 10, 1);

  const issues: string[] = [];
  const name = (id: number) => byId.get(id)!.webName;
  const ep = (id: number) => expectedPoints(byId.get(id)!.card);

  for (const id of lineup.starters) {
    if (ep(id) === 0) issues.push(`${name(id)} is starting but is not expected to play.`);
  }
  const dropped = lineup.starters.filter((id) => !best.starters.includes(id));
  const promoted = best.starters.filter((id) => !lineup.starters.includes(id));
  promoted.forEach((id, i) => {
    const out = dropped[i];
    if (out !== undefined && ep(id) - ep(out) >= noticeGapPoints) {
      issues.push(`${name(id)} (${round(ep(id), 1)} expected points) is benched while ${name(out)} (${round(ep(out), 1)}) starts.`);
    }
  });
  if (lineup.captain !== best.captain && ep(best.captain) - ep(lineup.captain) >= noticeGapPoints) {
    issues.push(
      `Captain ${name(lineup.captain)} has ${round(ep(lineup.captain), 1)} expected points; ${name(best.captain)} has ${round(ep(best.captain), 1)}.`,
    );
  }
  const idealBench = orderBench(lineup.bench.map((id) => byId.get(id)!));
  if (idealBench.join() !== lineup.bench.join()) {
    issues.push(`Bench order: ${idealBench.map(name).join(", ")} covers a non-starter better.`);
  }

  return { rating, expectedPoints: mine, bestExpectedPoints: top, issues, best };
}
