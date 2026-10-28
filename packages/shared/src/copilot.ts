import type { SiteCard } from "./site.ts";
import type { Squad, SquadPlayer } from "./squad.ts";

/**
 * The agent's tools, as pure functions (docs/agent.md).
 *
 * The agent never computes: it calls these, and explains what they return.
 * Results are deliberately COMPACT — every token a tool returns is a token
 * the model reads on every later turn.
 */

export type Position = "GKP" | "DEF" | "MID" | "FWD";

/** What a tool result says about one player. */
export interface PlayerFacts {
  id: number;
  name: string;
  team: string;
  position: string;
  priceM: number;
  ownershipPct: number;
  status: string;
  chanceOfPlaying: number | null;
  news: string | null;
  pointsLast4: number;
  minutesLast4: number;
  xgiPer90: number;
  minutesRisk: string;
  goalThreat: string;
  /** e.g. "AVL(A) 3 · FUL(H) 2" — next five, with FPL difficulty 1-5. */
  next5: string;
  fixtureRun: string;
  expectedPointsNext: number;
}

export function playerFacts(card: SiteCard): PlayerFacts {
  return {
    id: card.fplId,
    name: card.webName,
    team: card.team,
    position: card.position,
    priceM: card.priceM,
    ownershipPct: card.ownership,
    status: STATUS[card.status] ?? card.status,
    chanceOfPlaying: card.chanceOfPlayingNextRound,
    news: card.news || null,
    pointsLast4: card.form.points,
    minutesLast4: card.form.minutes,
    xgiPer90: round2(card.xgiPer90),
    minutesRisk: card.minutesRisk.band,
    goalThreat: card.goalThreat.band,
    next5: card.fixturesLong.fixtures
      .map((f) =>
        f.isBlank || !f.opponent
          ? `GW${f.gameweek} blank`
          : `${f.opponent}(${f.isHome ? "H" : "A"}) ${f.difficulty ?? "?"}`,
      )
      .join(" · "),
    fixtureRun: card.fixturesLong.band,
    expectedPointsNext: card.epNext,
  };
}

const STATUS: Record<string, string> = {
  a: "available",
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable",
  n: "not in squad",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const tenths = (m: number) => Math.round(m * 10);

/** Accent- and case-insensitive, so "odegaard" finds Ødegaard. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/[^a-z0-9 ]/gi, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolve a name the model typed. Exact match first, then prefix, then
 * substring; ties broken by ownership, so "Fernandes" finds the one people
 * mean. Returns at most 3, so an ambiguous name comes back as a choice.
 */
export function findPlayers(cards: readonly SiteCard[], query: string): SiteCard[] {
  const q = normalizeName(query);
  if (!q) return [];
  const byOwnership = (a: SiteCard, b: SiteCard) => b.ownership - a.ownership;
  for (const test of [
    (n: string) => n === q,
    (n: string) => n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q)),
    (n: string) => n.includes(q),
  ]) {
    const hits = cards.filter((c) => test(normalizeName(c.webName))).sort(byOwnership);
    if (hits.length > 0) return hits.slice(0, 3);
  }
  return [];
}

export type SortKey = "form" | "xgi90" | "fixtures" | "ownership" | "expected_points" | "price";

export interface SearchFilters {
  position?: Position;
  maxPriceM?: number;
  team?: string;
  sortBy: SortKey;
  limit: number;
  /** Skip doubtful, injured, suspended and unavailable players. Default true. */
  availableOnly?: boolean;
  excludeIds?: readonly number[];
}

const SORTERS: Record<SortKey, (a: SiteCard, b: SiteCard) => number> = {
  form: (a, b) => b.form.points - a.form.points,
  xgi90: (a, b) => b.xgiPer90 - a.xgiPer90,
  // lower adjusted difficulty = kinder run
  fixtures: (a, b) => a.fixturesLong.adjustedDifficulty - b.fixturesLong.adjustedDifficulty,
  ownership: (a, b) => b.ownership - a.ownership,
  expected_points: (a, b) => b.epNext - a.epNext,
  price: (a, b) => b.priceM - a.priceM,
};

/** Minutes behind a per-90 rate before it is trusted (CLAUDE.md §4c). */
const MIN_MINUTES_LAST4 = 180;

export function searchPlayers(cards: readonly SiteCard[], f: SearchFilters): PlayerFacts[] {
  const exclude = new Set(f.excludeIds ?? []);
  const team = f.team?.toUpperCase();
  return cards
    .filter((c) => !exclude.has(c.fplId))
    .filter((c) => !f.position || c.position === f.position)
    .filter((c) => f.maxPriceM === undefined || tenths(c.priceM) <= tenths(f.maxPriceM))
    .filter((c) => !team || c.team === team)
    .filter((c) => (f.availableOnly ?? true ? c.status === "a" : true))
    // Someone who does not play is not an option, whatever their per-90 says.
    .filter((c) => c.form.minutes >= MIN_MINUTES_LAST4)
    .sort(SORTERS[f.sortBy])
    .slice(0, Math.min(Math.max(f.limit, 1), 10))
    .map(playerFacts);
}

/** The squad as the agent reads it: compact, ordered, with the bank. */
export function squadFacts(squad: Squad) {
  const line = (p: SquadPlayer) => ({
    id: p.fplId,
    name: p.webName,
    team: p.team,
    position: p.position,
    priceM: p.priceM,
    role: p.isCaptain ? "captain" : p.isViceCaptain ? "vice-captain" : p.isStarter ? "starter" : "bench",
    status: STATUS[p.status] ?? p.status,
    chanceOfPlaying: p.chanceOfPlayingNextRound,
    gameweekPoints: p.pickPoints,
    seasonPoints: p.seasonPoints,
    pointsLast4: p.formPoints,
    minutesRisk: p.minutesRisk,
    fixtureRun: p.fixtureBand,
  });
  return {
    team: squad.teamName,
    gameweek: squad.gameweek,
    gameweekPoints: squad.gameweekPoints,
    totalPoints: squad.totalPoints,
    overallRank: squad.overallRank,
    bankM: squad.bankM,
    squadValueM: squad.valueM,
    activeChip: squad.activeChip,
    starters: squad.starters.map(line),
    bench: squad.bench.map(line),
  };
}

export interface TransferCheck {
  valid: boolean;
  problems: string[];
  out: { id: number; name: string; position: string; priceM: number }[];
  in: { id: number; name: string; position: string; team: string; priceM: number }[];
  bankBeforeM: number;
  /** Bank after the transfers, using current prices as the selling price. */
  bankAfterM: number;
  note: string;
}

/**
 * FPL's transfer rules, checked by code: same number out and in, positions
 * match one for one, nobody bought twice, at most 3 per club afterwards, and
 * the bank cannot go negative.
 *
 * The SELLING price is an estimate: FPL keeps half of any rise since purchase
 * and the purchase price is private, so the real figure can be slightly
 * lower. The note says so every time.
 */
export function checkTransfer(
  squad: Squad,
  cards: ReadonlyMap<number, SiteCard>,
  outIds: readonly number[],
  inIds: readonly number[],
): TransferCheck {
  const problems: string[] = [];
  const owned = [...squad.starters, ...squad.bench];
  const ownedIds = new Set(owned.map((p) => p.fplId));

  const outs = outIds.map((id) => owned.find((p) => p.fplId === id));
  const ins = inIds.map((id) => cards.get(id));

  outIds.forEach((id, i) => {
    if (!outs[i]) problems.push(`Player ${id} is not in this squad, so cannot be sold.`);
  });
  inIds.forEach((id, i) => {
    if (!ins[i]) problems.push(`Player ${id} was not found.`);
    else if (ownedIds.has(id) && !outIds.includes(id)) problems.push(`${ins[i]!.webName} is already in the squad.`);
  });
  if (outIds.length !== inIds.length) problems.push("The number of players out and in must match.");
  if (outIds.length === 0 || outIds.length > 5) problems.push("Check between 1 and 5 transfers at a time.");

  const validOuts = outs.filter((p): p is SquadPlayer => p !== undefined);
  const validIns = ins.filter((c): c is SiteCard => c !== undefined);

  const count = (ps: readonly string[]) =>
    ps.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p]: (acc[p] ?? 0) + 1 }), {});
  const outPos = count(validOuts.map((p) => p.position));
  const inPos = count(validIns.map((c) => c.position));
  for (const pos of new Set([...Object.keys(outPos), ...Object.keys(inPos)])) {
    if ((outPos[pos] ?? 0) !== (inPos[pos] ?? 0)) {
      problems.push(`Positions must match: ${outPos[pos] ?? 0} ${pos} out but ${inPos[pos] ?? 0} in.`);
    }
  }

  const clubs = count([
    ...owned.filter((p) => !outIds.includes(p.fplId)).map((p) => p.team),
    ...validIns.map((c) => c.team),
  ]);
  for (const [club, n] of Object.entries(clubs)) {
    if (n > 3) problems.push(`That would be ${n} players from ${club}; the limit is 3.`);
  }

  const bankAfter =
    tenths(squad.bankM) +
    validOuts.reduce((s, p) => s + tenths(p.priceM), 0) -
    validIns.reduce((s, c) => s + tenths(c.priceM), 0);
  if (bankAfter < 0) problems.push(`Short by £${(-bankAfter / 10).toFixed(1)}m.`);

  return {
    valid: problems.length === 0,
    problems,
    out: validOuts.map((p) => ({ id: p.fplId, name: p.webName, position: p.position, priceM: p.priceM })),
    in: validIns.map((c) => ({ id: c.fplId, name: c.webName, position: c.position, team: c.team, priceM: c.priceM })),
    bankBeforeM: squad.bankM,
    bankAfterM: bankAfter / 10,
    note:
      "Estimate: selling prices use current prices. FPL keeps half of any rise since you bought, so the real bank after may be slightly lower. Extra transfers beyond your free ones cost 4 points each.",
  };
}
