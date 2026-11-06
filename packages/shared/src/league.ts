import { INSIGHT_CONFIG } from "./insights/config.ts";
import type { LeagueStandings } from "./schemas/fpl-entry.ts";

/**
 * Mini-league spy (ADR-0021): what a classic league's managers did this
 * gameweek (captains, chips) and how your fifteen differ from theirs. Only
 * public FPL data; every share is counted over the rivals actually analysed.
 */
export interface RivalPicks {
  entry: number;
  /** All fifteen, FPL ids. */
  picks: number[];
  captain: number | null;
  chip: string | null;
}

export interface PlayerName {
  name: string;
  team: string;
  teamCode: number;
  position: string;
}

export interface LeagueRow {
  entry: number;
  team: string;
  manager: string;
  rank: number;
  /** Places gained since last gameweek (negative = dropped). */
  move: number;
  gameweek: number;
  total: number;
  captain: string | null;
  chip: string | null;
}

export interface LeagueCount {
  fplId: number;
  name: string;
  team: string;
  teamCode: number;
  position: string;
  count: number;
  /** 0-100, of the analysed rivals. */
  share: number;
}

export interface LeagueSpy {
  name: string;
  /** Managers whose teams were read; shares are out of this. */
  analysed: number;
  table: LeagueRow[];
  captains: LeagueCount[];
  /** Chips played this gameweek by the teams read, most played first, with their count. */
  chips: { chip: string; count: number }[];
  owned: LeagueCount[];
  /** Present when "you" are given and your picks are known. */
  you: { differentials: LeagueCount[]; threats: LeagueCount[]; captain: LeagueCount | null } | null;
}

function counts(ids: readonly number[], analysed: number, names: ReadonlyMap<number, PlayerName>): LeagueCount[] {
  const tally = new Map<number, number>();
  for (const id of ids) tally.set(id, (tally.get(id) ?? 0) + 1);
  return [...tally]
    .flatMap(([fplId, count]) => {
      const n = names.get(fplId);
      return n ? [{ fplId, ...n, count, share: Math.round((count / Math.max(analysed, 1)) * 100) }] : [];
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function leagueSpy(
  standings: LeagueStandings,
  rivals: ReadonlyMap<number, RivalPicks>,
  names: ReadonlyMap<number, PlayerName>,
  you: RivalPicks | null = null,
): LeagueSpy {
  const cfg = INSIGHT_CONFIG.league;
  const analysedPicks = standings.standings.results.flatMap((r) => (rivals.has(r.entry) && r.entry !== you?.entry ? [rivals.get(r.entry)!] : []));
  const analysed = analysedPicks.length;
  const table: LeagueRow[] = standings.standings.results.map((r) => {
    const p = rivals.get(r.entry);
    return {
      entry: r.entry,
      team: r.entry_name,
      manager: r.player_name,
      rank: r.rank,
      move: r.last_rank > 0 ? r.last_rank - r.rank : 0,
      gameweek: r.event_total,
      total: r.total,
      captain: p?.captain ? (names.get(p.captain)?.name ?? null) : null,
      chip: p?.chip ?? null,
    };
  });
  const captains = counts(analysedPicks.flatMap((p) => (p.captain ? [p.captain] : [])), analysed, names);
  const owned = counts(analysedPicks.flatMap((p) => p.picks), analysed, names);
  let mine: LeagueSpy["you"] = null;
  if (you) {
    const ownedBy = new Map(owned.map((o) => [o.fplId, o]));
    const yours = new Set(you.picks);
    const blank = (fplId: number): LeagueCount | null => {
      const n = names.get(fplId);
      return n ? { fplId, ...n, count: 0, share: 0 } : null;
    };
    const differentials = you.picks
      .map((id) => ownedBy.get(id) ?? blank(id))
      .filter((o): o is LeagueCount => o !== null && o.share <= cfg.differentialMax)
      .sort((a, b) => a.share - b.share || a.name.localeCompare(b.name));
    const threats = owned.filter((o) => !yours.has(o.fplId) && o.share >= cfg.threatMin);
    const captain = you.captain ? (captains.find((c) => c.fplId === you.captain) ?? blank(you.captain)) : null;
    mine = { differentials, threats, captain };
  }
  const chipTally = new Map<string, number>();
  for (const p of analysedPicks) if (p.chip) chipTally.set(p.chip, (chipTally.get(p.chip) ?? 0) + 1);
  const chips = [...chipTally].map(([chip, count]) => ({ chip, count })).sort((a, b) => b.count - a.count || a.chip.localeCompare(b.chip));
  return { name: standings.league.name, analysed, table, captains, chips, owned: owned.slice(0, 10), you: mine };
}

/** A league ID, or a pasted FPL league address (".../leagues/123/standings/c"). */
export function parseLeagueInput(raw: string): number | null {
  const text = raw.trim();
  const fromUrl = /\/leagues\/(\d{1,9})(?:\/|$|\?)/.exec(text);
  const digits = fromUrl ? fromUrl[1]! : text;
  if (!/^\d{1,9}$/.test(digits)) return null;
  const id = Number(digits);
  return id > 0 ? id : null;
}
