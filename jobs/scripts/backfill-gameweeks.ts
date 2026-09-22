/**
 * Backfill per-gameweek stats for specific gameweeks.
 *
 *   pnpm backfill:gw 1 2 3 4
 *
 * daily-sync only fetches the current gameweek plus any FPL has not marked
 * data_checked, capped at 5 per run. After an outage — or when seeding a new
 * database mid-season — this pulls named gameweeks deliberately
 * (docs/operations.md).
 */
import {
  assertDatabaseAllowed,
  connect,
  isLocalDatabase,
  LOCAL_DB_URL,
} from "../src/db.ts";
import { fetchEventLive } from "../src/fpl.ts";
import { errorMessage } from "../src/http.ts";
import { loadPlayerGameweekStats } from "../src/load/gameweek-stats.ts";
import type { LoadContext } from "../src/load/context.ts";

function parseGameweeks(): number[] {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const gameweeks = args.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 38);

  if (gameweeks.length === 0) {
    throw new Error("Usage: pnpm backfill:gw <gameweek> [<gameweek> ...]   e.g. pnpm backfill:gw 1 2 3 4");
  }
  return [...new Set(gameweeks)].sort((a, b) => a - b);
}

async function main() {
  const gameweeks = parseGameweeks();
  const url = process.env["SUPABASE_DB_URL"] ?? LOCAL_DB_URL;
  assertDatabaseAllowed(url, process.argv.includes("--cloud"));

  console.log(
    `Backfilling gameweeks ${gameweeks.join(", ")} ` +
      `(${isLocalDatabase(url) ? "local" : "REMOTE"})\n`,
  );

  const db = connect(url);
  try {
    const [season] = await db<{ id: string }[]>`
      select id from core.seasons where is_current order by id desc limit 1
    `;
    if (!season) throw new Error("No current season. Run `pnpm job:daily` first.");
    const seasonId = Number(season.id);

    const teams = await db<{ id: string; fpl_id: number }[]>`
      select id, fpl_id from core.teams where season_id = ${seasonId}
    `;
    const players = await db<{ id: string; fpl_id: number }[]>`
      select id, fpl_id from core.players where season_id = ${seasonId}
    `;
    const gws = await db<{ id: string; fpl_event_id: number }[]>`
      select id, fpl_event_id from core.gameweeks where season_id = ${seasonId}
    `;

    const ctx: LoadContext = {
      db,
      seasonId,
      teamIds: new Map(teams.map((t) => [Number(t.fpl_id), Number(t.id)])),
      playerIds: new Map(players.map((p) => [Number(p.fpl_id), Number(p.id)])),
      gameweekIds: new Map(gws.map((g) => [Number(g.fpl_event_id), Number(g.id)])),
    };

    for (const gameweek of gameweeks) {
      const live = await fetchEventLive(gameweek);
      const result = await loadPlayerGameweekStats(ctx, live, gameweek);
      console.log(`  gw${String(gameweek).padEnd(2)} ${result.rows} rows`);
    }

    console.log("\nDone. Re-run `pnpm job:daily` to rebuild the report with the new form data.");
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(`\nbackfill failed: ${errorMessage(error)}`);
  process.exit(1);
});
