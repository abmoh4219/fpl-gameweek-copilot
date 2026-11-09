import { INSIGHT_CONFIG, leagueSpy, type LeagueSpy, type PlayerName, type RivalPicks } from "@fpl/shared";
import { allCards } from "./cards";
import { fetchEntry, fetchLeague, fetchPicks } from "./fpl";
import { readView } from "./supabase";

/**
 * Load a mini-league for the spy (ADR-0021): its standings, then the picks of
 * up to INSIGHT_CONFIG.league.rivals managers from the top, plus yours if you
 * are not among them. Every call is cached per team and gameweek (picks never
 * change after a deadline), so a busy league costs FPL nothing after its first
 * view. A rival whose picks can't be read is simply left out of the shares.
 */
async function currentGameweek(firstEntry: number): Promise<number | null> {
  // FPL's own answer first (live, cached per team); our database as the fallback.
  const fromFpl = (await fetchEntry(firstEntry).catch(() => null))?.current_event ?? null;
  if (fromFpl) return fromFpl;
  const rows = await readView<{ gameweek: number }>("gameweeks", "select=gameweek&is_current=is.true&limit=1", 1800).catch(() => []);
  return rows[0]?.gameweek ?? null;
}

async function picksFor(entry: number, gameweek: number): Promise<RivalPicks | null> {
  try {
    // Only the picks and the captain are read here, and those never change after the deadline.
    const p = await fetchPicks(entry, gameweek, 86_400);
    return { entry, picks: p.picks.map((x) => x.element), captain: p.picks.find((x) => x.is_captain)?.element ?? null, chip: p.active_chip };
  } catch {
    return null;
  }
}

/** Run at most `size` requests at a time: kinder to FPL than twenty at once. */
async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

/** Your own line in a league, from your entry (cached): rank, team name, gameweek and total points. */
export interface YourLine {
  rank: number;
  team: string;
  gameweek: number;
  total: number;
}

export async function loadLeague(id: number, me: number | null): Promise<(LeagueSpy & { gameweek: number; yourLine: YourLine | null }) | null> {
  const standings = await fetchLeague(id);
  const first = standings.standings.results[0];
  if (!first) return null;
  const gameweek = await currentGameweek(first.entry);
  if (!gameweek) return null;
  const top = standings.standings.results.slice(0, INSIGHT_CONFIG.league.rivals).map((r) => r.entry);
  const entries = me && !top.includes(me) ? [...top, me] : top;
  const [picked, cards] = await Promise.all([inBatches(entries, 5, (e) => picksFor(e, gameweek)), allCards()]);
  const rivals = new Map<number, RivalPicks>();
  for (const p of picked) if (p && top.includes(p.entry)) rivals.set(p.entry, p);
  const you = me ? (picked.find((p) => p?.entry === me) ?? null) : null;
  const names = new Map<number, PlayerName>();
  for (const [fplId, { card, teamCode }] of cards) names.set(fplId, { name: card.webName, team: card.team, teamCode, position: card.position });
  let yourLine: YourLine | null = null;
  if (me) {
    const entry = await fetchEntry(me).catch(() => null);
    const rank = entry?.leagues?.classic.find((l) => l.id === id)?.entry_rank ?? null;
    if (entry && rank) yourLine = { rank, team: entry.name, gameweek: entry.summary_event_points ?? 0, total: entry.summary_overall_points ?? 0 };
  }
  return { ...leagueSpy(standings, rivals, names, you), gameweek, yourLine };
}
