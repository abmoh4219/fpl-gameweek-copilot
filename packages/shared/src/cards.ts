import { INSIGHT_CONFIG } from "./insights/config.ts";
import type { StatPosition, StatRow } from "./stats.ts";

/**
 * What the shareable cards show (ADR-0019): small pure selections over the
 * rows the site already reads, so every card is testable and every number on
 * it comes from FPL's data, never from a guess.
 */

export interface TransferRadar {
  in: StatRow[];
  out: StatRow[];
}

/** This gameweek's biggest net transfers in and out, from FPL's own counts. */
export function transferRadar(rows: readonly StatRow[], size: number = INSIGHT_CONFIG.cards.radarSize): TransferRadar {
  const byNet = [...rows].sort((a, b) => b.netTransfers - a.netTransfers || a.webName.localeCompare(b.webName));
  return {
    in: byNet.filter((r) => r.netTransfers > 0).slice(0, size),
    out: byNet.filter((r) => r.netTransfers < 0).reverse().slice(0, size),
  };
}

export interface TemplateXi {
  /** e.g. "4-4-2". */
  formation: string;
  /** Keeper first, then defenders, midfielders and forwards, each most-owned first. */
  players: StatRow[];
}

const ORDER: StatPosition[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * The best legal XI by any number: one keeper, then FPL's formation rules
 * (3-5 defenders, 2-5 midfielders, 1-3 forwards), filled by that number.
 * Picking greedily under the per-position limits gives the highest total.
 * Players with a value of 0 or less are never picked.
 */
export function bestXiBy(rows: readonly StatRow[], value: (r: StatRow) => number): TemplateXi | null {
  const { formation } = INSIGHT_CONFIG.lineup;
  const ranked = (pos: StatPosition) => rows.filter((r) => r.position === pos && value(r) > 0).sort((a, b) => value(b) - value(a) || a.webName.localeCompare(b.webName));
  const pools = { GKP: ranked("GKP"), DEF: ranked("DEF"), MID: ranked("MID"), FWD: ranked("FWD") };
  if (pools.GKP.length < 1 || pools.DEF.length < formation.DEF.min || pools.MID.length < formation.MID.min || pools.FWD.length < formation.FWD.min) return null;

  const take: Record<StatPosition, number> = { GKP: 1, DEF: formation.DEF.min, MID: formation.MID.min, FWD: formation.FWD.min };
  const max: Record<"DEF" | "MID" | "FWD", number> = { DEF: formation.DEF.max, MID: formation.MID.max, FWD: formation.FWD.max };
  let free = 11 - (take.GKP + take.DEF + take.MID + take.FWD);
  while (free > 0) {
    const next = (["DEF", "MID", "FWD"] as const)
      .filter((p) => take[p] < max[p] && pools[p][take[p]])
      .sort((a, b) => value(pools[b][take[b]]!) - value(pools[a][take[a]]!))[0];
    if (!next) return null;
    take[next] += 1;
    free -= 1;
  }
  const players = ORDER.flatMap((p) => pools[p].slice(0, take[p]));
  return { formation: `${take.DEF}-${take.MID}-${take.FWD}`, players };
}

/** The most-owned legal XI: the template most FPL managers are running. */
export function templateXi(rows: readonly StatRow[]): TemplateXi | null {
  return bestXiBy(rows, (r) => r.ownership);
}
