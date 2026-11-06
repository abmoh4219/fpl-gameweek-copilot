import { INSIGHT_CONFIG } from "./insights/config.ts";
import { round } from "./insights/form.ts";
import { expectedPoints, lineupProblems, rateLineup, type Lineup, type LineupPlayer } from "./insights/lineup.ts";
import { canCaptain, captainScore } from "./insights/selections.ts";
import { checkTransfer, searchPlayers, type SortKey } from "./copilot.ts";
import { planOf, type TeamPlan } from "./plan.ts";
import type { SiteCard } from "./site.ts";
import type { Squad } from "./squad.ts";

/**
 * The Gaffer: five squad checks written in code (ADR-0016). No model is in
 * the loop. Every function here is pure, works on the manager's real FPL
 * squad, and returns the numbers behind its answer so the page can show them.
 * Anything about next gameweek rests on FPL's expected points and is an
 * ESTIMATE wherever it is shown.
 *
 * A check that changes the team returns a TeamPlan, which the dugout draws on
 * the pitch for the manager to apply or revert — the same plan the agent used.
 */

const cfg = INSIGHT_CONFIG.gaffer;

/** The fifteen as the lineup engine reads them. Null when a card is missing. */
export function squadPool(squad: Squad, cards: ReadonlyMap<number, SiteCard>): LineupPlayer[] | null {
  const pool = [...squad.starters, ...squad.bench].flatMap((p) => {
    const card = cards.get(p.fplId);
    return card ? [{ fplId: p.fplId, webName: p.webName, position: p.position, card }] : [];
  });
  return pool.length === 15 ? pool : null;
}

function lineupOf(plan: TeamPlan): Lineup {
  return { starters: plan.starters, bench: plan.bench, captain: plan.captain, vice: plan.vice };
}

// ------------------------------------------------------- 1 + 2: the XI --

export interface LineupCheck {
  /** 0-10: how close the current XI is to the best the fifteen can field. Estimate. */
  rating: number;
  pointsNow: number;
  pointsBest: number;
  /** Code-written reasons, worst first. Empty when the XI is already the best. */
  issues: string[];
  /** The best XI, bench order and armband, as a plan for the pitch. */
  best: TeamPlan;
}

/** Rate the XI as FPL has it, and the best XI the same fifteen can field. */
export function lineupCheck(squad: Squad, cards: ReadonlyMap<number, SiteCard>): LineupCheck | null {
  const pool = squadPool(squad, cards);
  if (!pool) return null;
  const current = planOf(squad);
  const r = rateLineup(lineupOf(current), pool);
  return {
    rating: r.rating,
    pointsNow: r.expectedPoints,
    pointsBest: r.bestExpectedPoints,
    issues: r.issues,
    best: { ...current, ...r.best },
  };
}

// -------------------------------------------------------- 3: captain --

export interface CaptainOption {
  fplId: number;
  webName: string;
  team: string;
  /** Our captain score: FPL expected points, goal threat, fixture ease, home. Estimate. */
  score: number;
  epNext: number;
  xgiPer90: number;
  minutesRisk: string;
  goalThreat: string;
  onPenalties: boolean;
  /** e.g. "AVL (H)"; null for a blank. */
  next: string | null;
  /** False when the minutes are too uncertain to captain (the reason says why). */
  eligible: boolean;
  reason: string | null;
  isCaptain: boolean;
  isVice: boolean;
}

/** The starting outfielders ranked by captain score, the ones who can be trusted with the armband first. */
export function captainOptions(squad: Squad, cards: ReadonlyMap<number, SiteCard>): CaptainOption[] {
  return squad.starters
    .filter((p) => p.position !== "GKP")
    .flatMap((p) => {
      const card = cards.get(p.fplId);
      if (!card) return [];
      const f = card.fixtures.fixtures[0];
      const eligible = canCaptain(card) && expectedPoints(card) > 0;
      const reason = eligible
        ? null
        : expectedPoints(card) === 0
          ? "Not expected to play"
          : card.minutesRisk.score > INSIGHT_CONFIG.captain.maxMinutesRisk
            ? `${card.minutesRisk.band} minutes risk`
            : "Too few minutes in the last four gameweeks";
      return [
        {
          fplId: p.fplId,
          webName: p.webName,
          team: p.team,
          score: round(captainScore(card), 1),
          epNext: card.epNext,
          xgiPer90: round(card.xgiPer90, 2),
          minutesRisk: card.minutesRisk.band,
          goalThreat: card.goalThreat.band,
          onPenalties: card.goalThreat.onPenalties,
          next: f && !f.isBlank && f.opponent ? `${f.opponent} (${f.isHome ? "H" : "A"})` : null,
          eligible,
          reason,
          isCaptain: p.isCaptain,
          isVice: p.isViceCaptain,
        },
      ];
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

/** The squad with a new captain; the vice is the best other option that can be trusted. */
export function captainPlan(squad: Squad, options: readonly CaptainOption[], captain: number): TeamPlan {
  const plan = planOf(squad);
  const vice = options.find((o) => o.eligible && o.fplId !== captain)?.fplId ?? (plan.captain === captain ? plan.vice : plan.captain);
  return { ...plan, captain, vice };
}

// ------------------------------------------------------- 4: transfer --

export const TRANSFER_SORTS = ["expected_points", "form", "fixtures"] as const satisfies readonly SortKey[];
export type TransferSort = (typeof TRANSFER_SORTS)[number];

export interface TransferIdea {
  fplId: number;
  webName: string;
  team: string;
  priceM: number;
  ownership: number;
  epNext: number;
  /** Points over the last four gameweeks. */
  formPoints: number;
  xgiPer90: number;
  fixtureRun: string;
  /** Bank after the swap, selling at today's price. Estimate. */
  bankAfterM: number;
}

export interface TransferSlot {
  out: { fplId: number; webName: string; team: string; position: string; priceM: number; epNext: number; status: string };
  /** Bank plus the player's price: the most a replacement can cost. Estimate. */
  budgetM: number;
  ideas: Record<TransferSort, TransferIdea[]>;
}

/**
 * Legal like-for-like replacements for every squad player, within budget and
 * FPL's 3-per-club rule, under each sort. These are OPTIONS ranked by one
 * number each, never a recommendation to sell.
 */
export function transferOptions(squad: Squad, cards: readonly SiteCard[]): TransferSlot[] {
  const byId = new Map(cards.map((c) => [c.fplId, c]));
  const owned = [...squad.starters, ...squad.bench];
  const ownedIds = owned.map((p) => p.fplId);
  return owned.flatMap((p) => {
    const card = byId.get(p.fplId);
    if (!card) return [];
    const budget = round(squad.bankM + p.priceM, 1);
    const ideas = Object.fromEntries(
      TRANSFER_SORTS.map((sortBy) => {
        const found = searchPlayers(cards, { position: p.position, maxPriceM: budget, sortBy, limit: cfg.transferSearch, excludeIds: ownedIds });
        const legal = found.flatMap((f) => {
          const check = checkTransfer(squad, byId, [p.fplId], [f.id]);
          return check.valid
            ? [
                {
                  fplId: f.id,
                  webName: f.name,
                  team: f.team,
                  priceM: f.priceM,
                  ownership: f.ownershipPct,
                  epNext: f.expectedPointsNext,
                  formPoints: f.pointsLast4,
                  xgiPer90: f.xgiPer90,
                  fixtureRun: f.fixtureRun,
                  bankAfterM: round(check.bankAfterM, 1),
                },
              ]
            : [];
        });
        return [sortBy, legal.slice(0, cfg.transferIdeas)];
      }),
    ) as Record<TransferSort, TransferIdea[]>;
    return [
      {
        out: { fplId: p.fplId, webName: p.webName, team: p.team, position: p.position, priceM: p.priceM, epNext: card.epNext, status: p.status },
        budgetM: budget,
        ideas,
      },
    ];
  });
}

/** One transfer as a plan: the new player takes the sold player's place, armband included. */
export function transferPlan(squad: Squad, out: number, inId: number): TeamPlan {
  const base = planOf(squad);
  const swap = (id: number) => (id === out ? inId : id);
  return {
    starters: base.starters.map(swap),
    bench: base.bench.map(swap),
    captain: swap(base.captain),
    vice: swap(base.vice),
    transfers: [{ out, in: inId }],
  };
}

// --------------------------------------------------- 5: injury check --

const STATUS_LABEL: Record<string, string> = { d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable", n: "Not in squad" };

export interface InjuryFlag {
  fplId: number;
  webName: string;
  team: string;
  isStarter: boolean;
  status: string;
  /** FPL's chance of playing next round; null when FPL gives none. */
  chance: number | null;
  news: string;
  /** For a starter who may miss out: the first bench player who could come on and keep the formation legal. */
  cover: { fplId: number; webName: string; epNext: number } | null;
}

/** Every flagged player in the fifteen, starters first, with FPL's own news and who covers them. */
export function injuryCheck(squad: Squad, cards: ReadonlyMap<number, SiteCard>): InjuryFlag[] {
  const pool = squadPool(squad, cards);
  const current = planOf(squad);
  const flagged = [...squad.starters, ...squad.bench].filter((p) => p.status !== "a");
  return flagged
    .map((p) => {
      let cover: InjuryFlag["cover"] = null;
      if (p.isStarter && pool) {
        for (const id of current.bench) {
          const sub = pool.find((x) => x.fplId === id)!;
          if (expectedPoints(sub.card) === 0 || sub.card.status !== "a") continue;
          const swap = (x: number) => (x === p.fplId ? id : x);
          const lineup = lineupOf({
            ...current,
            starters: current.starters.map(swap),
            bench: current.bench.map((b) => (b === id ? p.fplId : b)),
            captain: swap(current.captain),
            vice: swap(current.vice),
          });
          if (lineupProblems(lineup, pool).length === 0) {
            cover = { fplId: id, webName: sub.webName, epNext: sub.card.epNext };
            break;
          }
        }
      }
      return {
        fplId: p.fplId,
        webName: p.webName,
        team: p.team,
        isStarter: p.isStarter,
        status: STATUS_LABEL[p.status] ?? "Flagged",
        chance: p.chanceOfPlayingNextRound,
        news: p.news,
        cover,
      };
    })
    .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || (a.chance ?? 0) - (b.chance ?? 0));
}
