/**
 * Reads the public `api` views over the Data API (docs/database.md). Server
 * only: pages are rendered and cached on the server, so a visitor's browser
 * never calls Supabase and the cache absorbs traffic (CLAUDE.md §7).
 */
const URL_ = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const KEY = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

export class DataUnavailableError extends Error {}

/** GET one api view. `query` is a PostgREST query string, e.g. "select=*&limit=1". */
export async function readView<T>(view: string, query: string, revalidateSeconds = 600): Promise<T[]> {
  if (!URL_ || !KEY) throw new DataUnavailableError("Supabase is not configured");
  const res = await fetch(`${URL_}/rest/v1/${view}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "api" },
    next: { revalidate: revalidateSeconds, tags: [view] },
  });
  if (!res.ok) throw new DataUnavailableError(`${view}: HTTP ${res.status}`);
  return (await res.json()) as T[];
}
