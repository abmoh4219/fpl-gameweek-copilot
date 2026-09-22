import type { Db } from "../db.ts";

/**
 * Loaders resolve FPL's season-scoped ids to our surrogate primary keys once
 * per run, then reuse the maps. Every load is an idempotent upsert on the
 * table's natural unique key, batched into ONE statement per table.
 */
export interface LoadContext {
  db: Db;
  seasonId: number;
  /** FPL team id -> core.teams.id */
  teamIds: Map<number, number>;
  /** FPL element id -> core.players.id */
  playerIds: Map<number, number>;
  /** FPL event id -> core.gameweeks.id */
  gameweekIds: Map<number, number>;
}

export interface LoadResult {
  table: string;
  rows: number;
}

/** postgres.js sends an array of objects as a single multi-row statement. */
export const CHUNK_SIZE = 500;

export function chunk<T>(rows: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
