import type { BootstrapStatic } from "@fpl/shared";
import type { Db } from "../db.ts";
import type { LoadContext } from "../load/context.ts";
import { loadPlayers, loadSeason, loadTeams } from "../load/reference.ts";

/** Season label, derived from the FPL calendar rather than hardcoded. */
export function seasonNameFor(bootstrap: BootstrapStatic): string {
  const firstDeadline = bootstrap.events[0]?.deadline_time;
  const year = firstDeadline ? new Date(firstDeadline).getUTCFullYear() : new Date().getUTCFullYear();
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/**
 * Reference data both jobs need before they can write anything player-shaped.
 *
 * price-sync upserts teams and players too, cheaply (20 and ~670 rows), so a
 * transfer-window signing is tradeable in our data within 3 hours instead of
 * waiting for the nightly run.
 */
export interface Identity {
  ctx: LoadContext;
  seasonId: number;
  teamRows: number;
  playerRows: number;
  /** True when a dry run found nothing to compare against yet. */
  isEmpty: boolean;
}

export async function loadIdentity(
  db: Db,
  bootstrap: BootstrapStatic,
  dryRun: boolean,
): Promise<Identity> {
  const seasonName = seasonNameFor(bootstrap);

  if (dryRun) {
    const ctx = await readOnlyContext(db, seasonName);
    return {
      ctx,
      seasonId: ctx.seasonId,
      teamRows: 0,
      playerRows: 0,
      isEmpty: ctx.seasonId === 0 || ctx.playerIds.size === 0,
    };
  }

  const seasonId = await loadSeason(db, seasonName);
  const { result: teamResult, teamIds } = await loadTeams(db, seasonId, bootstrap);
  const { result: playerResult, playerIds } = await loadPlayers(
    db,
    { db, seasonId, teamIds },
    bootstrap,
  );
  const gameweekIds = await fetchGameweekIds(db, seasonId);

  return {
    ctx: { db, seasonId, teamIds, playerIds, gameweekIds },
    seasonId,
    teamRows: teamResult.rows,
    playerRows: playerResult.rows,
    isEmpty: false,
  };
}

/**
 * A dry run against a database with no data yet cannot resolve ids, so there
 * is nothing to compare or detect. Report what a real run WOULD create.
 */
export function printEmptyDatabasePlan(
  bootstrap: BootstrapStatic,
  extra: Record<string, number> = {},
): void {
  const counts: Record<string, number> = {
    season: 1,
    teams: bootstrap.teams.length,
    players: bootstrap.elements.length,
    gameweeks: bootstrap.events.length,
    player_snapshots: bootstrap.elements.length,
    price_observations: bootstrap.elements.length,
    ...extra,
  };
  printDryRunPlan(
    `first run against an empty database — would create season ${seasonNameFor(bootstrap)}`,
    Object.entries(counts).map(([table, rows]) => `${table.padEnd(20)} ${rows} rows`),
  );
}

/** A dry run writes nothing, so it reads the id maps that already exist. */
async function readOnlyContext(db: Db, seasonName: string): Promise<LoadContext> {
  const [season] = await db<{ id: string }[]>`
    select id from core.seasons where name = ${seasonName}
  `;
  if (!season) {
    // An empty database is a legitimate dry run: report what WOULD be created
    // rather than failing, so the first thing anyone tries works.
    return { db, seasonId: 0, teamIds: new Map(), playerIds: new Map(), gameweekIds: new Map() };
  }
  const seasonId = Number(season.id);

  const teams = await db<{ id: string; fpl_id: number }[]>`
    select id, fpl_id from core.teams where season_id = ${seasonId}
  `;
  const players = await db<{ id: string; fpl_id: number }[]>`
    select id, fpl_id from core.players where season_id = ${seasonId}
  `;

  return {
    db,
    seasonId,
    teamIds: new Map(teams.map((t) => [Number(t.fpl_id), Number(t.id)])),
    playerIds: new Map(players.map((p) => [Number(p.fpl_id), Number(p.id)])),
    gameweekIds: await fetchGameweekIds(db, seasonId),
  };
}

export async function fetchGameweekIds(db: Db, seasonId: number): Promise<Map<number, number>> {
  const rows = await db<{ id: string; fpl_event_id: number }[]>`
    select id, fpl_event_id from core.gameweeks where season_id = ${seasonId}
  `;
  return new Map(rows.map((r) => [Number(r.fpl_event_id), Number(r.id)]));
}

/** Prints what a dry run would have written, since it writes nothing. */
export function printDryRunPlan(label: string, rows: readonly string[]): void {
  console.log(`\n  DRY RUN — ${label} (nothing written):`);
  if (rows.length === 0) {
    console.log("    (no changes)");
    return;
  }
  for (const row of rows.slice(0, 25)) console.log(`    ${row}`);
  if (rows.length > 25) console.log(`    ... and ${rows.length - 25} more`);
}
