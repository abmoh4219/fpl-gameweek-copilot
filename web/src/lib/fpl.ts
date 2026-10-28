import { EntryPicksSchema, EntrySchema, type Entry, type EntryPicks } from "@fpl/shared";

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
  const parsed = EntrySchema.safeParse(await getJson(`/entry/${id}/`, 600));
  if (!parsed.success) throw new FplUnavailableError("Unexpected entry shape from FPL");
  return parsed.data;
}

export async function fetchPicks(id: number, gameweek: number): Promise<EntryPicks> {
  // Picks for a gameweek only change at a deadline; an hour is plenty fresh.
  const parsed = EntryPicksSchema.safeParse(await getJson(`/entry/${id}/event/${gameweek}/picks/`, 3600));
  if (!parsed.success) throw new FplUnavailableError("Unexpected picks shape from FPL");
  return parsed.data;
}

/** FPL ids are positive integers; anything else is rejected before a request. */
export function parseTeamId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}
