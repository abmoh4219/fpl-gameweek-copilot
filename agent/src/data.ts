import type { SiteCard, TeamRun } from "@fpl/shared";
import { config } from "./config.ts";

/**
 * Read-only access to the public `api` views, cached in memory for a few
 * minutes: the pipeline refreshes them every three hours, so a burst of
 * questions costs one read, not one per question.
 */
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function view<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Accept-Profile": "api",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Data unavailable (${path.split("?")[0]}: HTTP ${res.status})`);
  const value = (await res.json()) as T;
  cache.set(path, { at: Date.now(), value });
  return value;
}

export async function allCards(): Promise<{ cards: SiteCard[]; teamCodes: Map<number, number> }> {
  const rows = await view<{ card: SiteCard; team_code: number }[]>("player_cards?select=card,team_code");
  const valid = rows.filter((r) => r.card?.version === 1);
  return { cards: valid.map((r) => r.card), teamCodes: new Map(valid.map((r) => [r.card.fplId, r.team_code])) };
}

export async function allTeamRuns(): Promise<TeamRun[]> {
  const rows = await view<{ run: TeamRun }[]>("team_runs?select=run");
  return rows.map((r) => r.run).filter((r) => r?.version === 1);
}

export interface PriceWatchRow {
  fpl_id: number;
  web_name: string;
  team_short_name: string;
  price_m: number;
  price_change_percent: number | null;
  direction: string | null;
  is_locked: boolean | null;
}

/** Estimates only. `momentum` and `hourly_rate` are never selected (CLAUDE.md §4c). */
export async function priceWatch(): Promise<PriceWatchRow[]> {
  return view<PriceWatchRow[]>(
    "price_watch?select=fpl_id,web_name,team_short_name,price_m,price_change_percent,direction,is_locked",
  );
}

export async function latestPreview(): Promise<{ gameweek: number | null; payload: unknown } | null> {
  const rows = await view<{ gameweek: number | null; payload: unknown }[]>(
    "previews?select=gameweek,payload&order=gameweek.desc&limit=1",
  );
  return rows[0] ?? null;
}
