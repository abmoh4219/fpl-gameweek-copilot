import { EntryPicksSchema, EntrySchema, EntrySeasonSchema, type Entry, type EntryPicks, type EntrySeason } from "@fpl/shared";

/**
 * The ONLY live FPL call a visitor can cause (CLAUDE.md §7): a manager's
 * entry and this gameweek's picks. Both are cached per team id, so the second
 * visitor asking about the same team costs FPL nothing. Every response is
 * parsed with Zod before use (§10).
 */
const FPL = "https://fantasy.premierleague.com/api";
// FPL is an undocumented courtesy API that expects a browser-like client.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class TeamNotFoundError extends Error {}
export class FplUnavailableError extends Error {}

async function getJson(path: string, revalidateSeconds: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${FPL}${path}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FplUnavailableError("FPL did not answer");
  }
  if (res.status === 404) throw new TeamNotFoundError("No FPL team with that id");
  if (!res.ok) throw new FplUnavailableError(`FPL answered ${res.status}`);
  return res.json();
}

export async function fetchEntry(id: number): Promise<Entry> {
  // The summary moves with live points and the deadline; half an hour keeps FPL calls low.
  const parsed = EntrySchema.safeParse(await getJson(`/entry/${id}/`, 1800));
  if (!parsed.success) throw new FplUnavailableError("Unexpected entry shape from FPL");
  return parsed.data;
}

export async function fetchPicks(id: number, gameweek: number): Promise<EntryPicks> {
  // Picks for a gameweek are locked at its deadline and never change after it;
  // a new gameweek is a new URL, so a day-long cache is never stale.
  const parsed = EntryPicksSchema.safeParse(await getJson(`/entry/${id}/event/${gameweek}/picks/`, 86_400));
  if (!parsed.success) throw new FplUnavailableError("Unexpected picks shape from FPL");
  return parsed.data;
}

/**
 * The manager's season so far (entry/{id}/history/): rank per gameweek and
 * chips used. Cached half an hour per team, like the entry (ADR-0020).
 */
export async function fetchSeason(id: number): Promise<EntrySeason> {
  const parsed = EntrySeasonSchema.safeParse(await getJson(`/entry/${id}/history/`, 1800));
  if (!parsed.success) throw new FplUnavailableError("Unexpected history shape from FPL");
  return parsed.data;
}

/** FPL ids are positive integers; anything else is rejected before a request. */
export function parseTeamId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/**
 * What a manager pastes when asked for their team: the bare id, or the whole
 * address of their Points page (".../entry/7653564/event/8").
 */
export function parseTeamInput(raw: string): number | null {
  const text = raw.trim();
  const fromUrl = /\/entry\/(\d{1,9})(?:\/|$|\?)/.exec(text);
  return parseTeamId(fromUrl ? fromUrl[1]! : text);
}
