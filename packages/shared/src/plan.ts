import { z } from "zod";
import type { Squad, SquadPlayer } from "./squad.ts";

/**
 * A team plan: the changes the co-pilot proposes — lineup, bench order,
 * captaincy and transfers — relative to the manager's real FPL team.
 *
 * Armband only READS FPL (no password, ever), so a plan is never sent to FPL.
 * The manager reviews it on the pitch, applies or reverts it, and makes the
 * changes in the FPL app. Building the squad from a plan and describing the
 * changes both live here, so the agent and the website can never disagree.
 */
export interface TeamPlan {
  /** Eleven FPL ids. */
  starters: number[];
  /** Four FPL ids, in FPL bench order (reserve keeper first). */
  bench: number[];
  captain: number;
  vice: number;
  /** Players sold and bought, in order. Ids refer to the real squad (out) and new players (in). */
  transfers: { out: number; in: number }[];
}

const id = z.number().int().positive().max(999_999_999);
export const TeamPlanSchema = z.object({
  starters: z.array(id).length(11),
  bench: z.array(id).length(4),
  captain: id,
  vice: id,
  transfers: z.array(z.object({ out: id, in: id })).max(5),
});

/** The plan that matches a squad exactly as it is in FPL: no changes. */
export function planOf(squad: Squad): TeamPlan {
  return {
    starters: squad.starters.map((p) => p.fplId),
    bench: squad.bench.map((p) => p.fplId),
    captain: squad.starters.find((p) => p.isCaptain)?.fplId ?? squad.starters[0]!.fplId,
    vice: squad.starters.find((p) => p.isViceCaptain)?.fplId ?? squad.starters[1]!.fplId,
    transfers: [],
  };
}

const ORDER = { GKP: 0, DEF: 1, MID: 2, FWD: 3 } as const;

/**
 * The squad as it would look with a plan applied. `incoming` holds the
 * players bought by its transfers. Null when the plan does not fit the squad
 * (an unknown id) — the caller then ignores the plan rather than drawing it.
 */
export function applyPlan(squad: Squad, plan: TeamPlan, incoming: ReadonlyMap<number, SquadPlayer>): Squad | null {
  const outs = new Set(plan.transfers.map((t) => t.out));
  const pool = new Map<number, SquadPlayer>();
  for (const p of [...squad.starters, ...squad.bench]) if (!outs.has(p.fplId)) pool.set(p.fplId, p);
  for (const t of plan.transfers) {
    const p = incoming.get(t.in);
    if (!p) return null;
    pool.set(p.fplId, p);
  }
  const ids = [...plan.starters, ...plan.bench];
  if (ids.some((i) => !pool.has(i)) || new Set(ids).size !== 15) return null;
  // A captain or vice on the bench is not a plan anyone could make in FPL.
  if (!plan.starters.includes(plan.captain) || !plan.starters.includes(plan.vice) || plan.captain === plan.vice) return null;

  const place = (fplId: number, slot: number, starter: boolean): SquadPlayer => {
    const p = pool.get(fplId)!;
    const isCaptain = starter && fplId === plan.captain;
    const multiplier = starter ? (isCaptain ? 2 : 1) : 0;
    return {
      ...p,
      slot,
      isStarter: starter,
      isCaptain,
      isViceCaptain: starter && fplId === plan.vice,
      multiplier,
      pickPoints: p.eventPoints * multiplier,
    };
  };

  const starters = plan.starters
    .map((i) => place(i, 0, true))
    .sort((a, b) => ORDER[a.position] - ORDER[b.position])
    .map((p, n) => ({ ...p, slot: n + 1 }));
  const bench = plan.bench.map((i, n) => place(i, 12 + n, false));

  const soldM = plan.transfers.reduce((acc, t) => {
    const out = [...squad.starters, ...squad.bench].find((p) => p.fplId === t.out);
    return acc + (out?.priceM ?? 0);
  }, 0);
  const boughtM = plan.transfers.reduce((acc, t) => acc + (incoming.get(t.in)?.priceM ?? 0), 0);

  return { ...squad, starters, bench, bankM: Math.round((squad.bankM + soldM - boughtM) * 10) / 10 };
}

/**
 * The plan in plain words, one change per line, as the manager will make
 * them in the FPL app. Empty when the plan changes nothing.
 */
export function describePlan(squad: Squad, plan: TeamPlan, incoming: ReadonlyMap<number, SquadPlayer>): string[] {
  const everyone = new Map<number, SquadPlayer>();
  for (const p of [...squad.starters, ...squad.bench]) everyone.set(p.fplId, p);
  for (const p of incoming.values()) everyone.set(p.fplId, p);
  const name = (i: number) => everyone.get(i)?.webName ?? `#${i}`;
  const lines: string[] = [];

  for (const t of plan.transfers) {
    const out = everyone.get(t.out);
    const inn = everyone.get(t.in);
    lines.push(`Transfer: ${name(t.out)} out, ${name(t.in)} in${out && inn ? ` (£${out.priceM.toFixed(1)}m → £${inn.priceM.toFixed(1)}m)` : ""}`);
  }

  const before = planOf(squad);
  const swapped = new Map(plan.transfers.map((t) => [t.in, t.out]));
  // A bought player who simply takes the sold player's place is not a lineup change.
  const was = (i: number) => swapped.get(i) ?? i;
  const startedBefore = new Set(before.starters);
  const nowStarting = plan.starters.filter((i) => !startedBefore.has(was(i)));
  const nowBenched = plan.bench.filter((i) => startedBefore.has(was(i)));
  if (nowStarting.length) lines.push(`Start: ${nowStarting.map(name).join(", ")}`);
  if (nowBenched.length) lines.push(`Bench: ${nowBenched.map(name).join(", ")}`);

  if (was(plan.captain) !== before.captain) lines.push(`Captain: ${name(before.captain)} → ${name(plan.captain)}`);
  if (was(plan.vice) !== before.vice) lines.push(`Vice-captain: ${name(before.vice)} → ${name(plan.vice)}`);

  const benchBefore = before.bench.join();
  const benchNow = plan.bench.map(was).join();
  if (!nowStarting.length && !nowBenched.length && benchBefore !== benchNow) {
    lines.push(`Bench order: ${plan.bench.map(name).join(", ")}`);
  }
  return lines;
}

/** True when a plan changes nothing about the real team. */
export function isEmptyPlan(squad: Squad, plan: TeamPlan): boolean {
  return describePlan(squad, plan, new Map()).length === 0 && plan.transfers.length === 0;
}
