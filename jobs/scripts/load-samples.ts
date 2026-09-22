/**
 * Load samples/ into the LOCAL Supabase database through the real loaders.
 *
 *   pnpm load:samples            -> local only
 *   pnpm load:samples --cloud    -> explicit opt-in, refuses otherwise
 *
 * Everything goes through jobs/src/load/*, the same code Phase 3 runs against
 * live data, so this exercises the real path rather than a seed file.
 */
import path from "node:path";

import { connect, isLocalDatabase, LOCAL_DB_URL } from "../src/db.ts";
import { errorMessage } from "../src/http.ts";
import { failSyncRun, finishSyncRun, startSyncRun } from "../src/load/sync-runs.ts";
import { loadSamplesInto, SAMPLE_SEASON } from "../src/load/from-samples.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function resolveTarget(): string {
  const allowCloud = process.argv.includes("--cloud");
  const url = process.env["SUPABASE_DB_URL"] ?? LOCAL_DB_URL;

  if (!isLocalDatabase(url) && !allowCloud) {
    throw new Error(
      "Refusing to load samples into a non-local database.\n" +
        "  SUPABASE_DB_URL does not point at 127.0.0.1, and samples are development data.\n" +
        "  Run `pnpm db:start` for a local stack, or pass --cloud if you really mean it.",
    );
  }
  if (!isLocalDatabase(url)) {
    console.warn("WARNING: --cloud passed, loading samples into a REMOTE database.\n");
  }
  return url;
}

async function main() {
  const url = resolveTarget();
  console.log(`Target: ${isLocalDatabase(url) ? "local Supabase" : "REMOTE database"}\n`);

  const db = connect(url);
  const runId = await startSyncRun(db, "load-samples");

  try {
    const outcome = await loadSamplesInto(db, {
      samplesDir: path.join(REPO_ROOT, "samples"),
      onWarning: (message) => console.warn(`  ${message}`),
    });

    await finishSyncRun(db, runId, outcome.results);

    console.log(`season ${SAMPLE_SEASON} -> id ${outcome.seasonId}\n`);
    for (const r of outcome.results) console.log(`  ${r.table.padEnd(24)} ${r.rows}`);
    if (outcome.unchangedPrices > 0) {
      console.log(`\n  ${outcome.unchangedPrices} players unchanged: no price row written.`);
    }
    console.log(`\nDone. sync_run ${runId} recorded.`);
  } catch (error) {
    await failSyncRun(db, runId, errorMessage(error)).catch(() => {});
    throw error;
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(`\nload-samples failed: ${errorMessage(error)}`);
  process.exit(1);
});
