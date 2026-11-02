import {
  applyPlan,
  describePlan,
  lineupPoints,
  planOf,
  rateLineup,
  type Lineup,
  type LineupPlayer,
  type SiteCard,
  type Squad,
} from "@fpl/shared";
import { readView } from "./supabase";

/**
 * The free toolkit: the same tested lineup engine the Gaffer's tools call,
 * run directly by code with no model in the loop. Every figure it returns is
 * an ESTIMATE (it rests on FPL's expected points) and is labelled as one.
 */

/** The published cards for a squad's fifteen, by FPL id. */
export async function squadCards(squad: Squad): Promise<Map<number, SiteCard>> {
  const ids = [...squad.starters, ...squad.bench].map((p) => p.fplId).join(",");
  const rows = await readView<{ fpl_id: number; card: SiteCard }>("player_cards", `select=fpl_id,card&fpl_id=in.(${ids})`);
  return new Map(rows.filter((r) => r.card?.version === 1).map((r) => [r.fpl_id, r.card]));
}

function poolOf(squad: Squad, cards: ReadonlyMap<number, SiteCard>): LineupPlayer[] {
  return [...squad.starters, ...squad.bench].flatMap((p) => {
    const card = cards.get(p.fplId);
    return card ? [{ fplId: p.fplId, webName: p.webName, position: p.position, card }] : [];
  });
}

export interface BestXiResult {
  /** The squad as FPL has it, and as the best XI would set it. */
  before: Squad;
  after: Squad;
  ratingBefore: number;
  pointsBefore: number;
  pointsAfter: number;
  /** Players moved into the XI, and the new captain if it changed. */
  promoted: number[];
  captainChanged: boolean;
  /** Plain-language list of the changes, written by code. */
  changes: string[];
  formation: string;
}

/** The strongest legal XI for a squad, ready to draw before and after. Null when a card is missing. */
export function bestXi(squad: Squad, cards: ReadonlyMap<number, SiteCard>): BestXiResult | null {
  const pool = poolOf(squad, cards);
  if (pool.length !== 15) return null;
  const current = planOf(squad);
  const lineup: Lineup = { starters: current.starters, bench: current.bench, captain: current.captain, vice: current.vice };
  const rating = rateLineup(lineup, pool);
  const best = rating.best;
  const plan = { ...current, ...best };
  const after = applyPlan(squad, plan, new Map());
  if (!after) return null;
  const position = (id: number) => pool.find((p) => p.fplId === id)!.position;
  const count = (pos: string) => best.starters.filter((id) => position(id) === pos).length;
  return {
    before: squad,
    after,
    ratingBefore: rating.rating,
    pointsBefore: lineupPoints(lineup, pool),
    pointsAfter: lineupPoints(best, pool),
    promoted: best.starters.filter((id) => !current.starters.includes(id)),
    captainChanged: best.captain !== current.captain,
    changes: describePlan(squad, plan, new Map()),
    formation: `${count("DEF")}-${count("MID")}-${count("FWD")}`,
  };
}

