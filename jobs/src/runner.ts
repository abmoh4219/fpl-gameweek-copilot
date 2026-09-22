/**
 * Shared lifecycle for every scheduled job: guard the database, open a
 * sync_runs row, run the work, close the row, alert on failure.
 *
 * Having this in one place is what makes "every run is recorded" true, which
 * is what makes the price_observations dedup lossless.
 */
import { assertDatabaseAllowed, connect, isLocalDatabase, LOCAL_DB_URL, type Db } from "./db.ts";
import { errorMessage, FplUnavailableError } from "./http.ts";
import { failSyncRun, finishSyncRun, startSyncRun } from "./load/sync-runs.ts";
import type { LoadResult } from "./load/context.ts";
import { redactSecrets, sendAlert } from "./telegram.ts";

/** Thrown to end a run as `skipped` rather than `failed`. Nobody is paged. */
export class JobSkipped extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "JobSkipped";
  }
}

export interface JobOptions {
  /** Explicit --cloud, typed by a human. */
  cloud: boolean;
  /** DRY_RUN=true or --dry-run: fetch and detect, write NOTHING. */
  dryRun: boolean;
  /** --simulate-failure: prove the alerting path works. */
  simulateFailure: boolean;
}

export interface JobContext extends JobOptions {
  db: Db;
  /** null in a dry run, because a dry run writes nothing at all. */
  syncRunId: number | null;
  results: LoadResult[];
  warnings: string[];
  record(result: LoadResult): void;
  warn(message: string): void;
}

export function parseJobOptions(argv: readonly string[] = process.argv): JobOptions {
  return {
    cloud: argv.includes("--cloud"),
    dryRun: argv.includes("--dry-run") || process.env["DRY_RUN"] === "true",
    simulateFailure:
      argv.includes("--simulate-failure") || process.env["SIMULATE_FAILURE"] === "true",
  };
}

export async function runJob(
  jobName: string,
  work: (ctx: JobContext) => Promise<void>,
): Promise<void> {
  const options = parseJobOptions();
  const url = process.env["SUPABASE_DB_URL"] ?? LOCAL_DB_URL;
  assertDatabaseAllowed(url, options.cloud);

  const started = Date.now();
  console.log(
    `${jobName}: starting (${isLocalDatabase(url) ? "local" : "cloud"}` +
      `${options.dryRun ? ", DRY RUN — nothing will be written" : ""})`,
  );

  const db = connect(url);
  const results: LoadResult[] = [];
  const warnings: string[] = [];

  // A dry run does not even open a sync_runs row: "writes nothing" is literal.
  const syncRunId = options.dryRun ? null : await startSyncRun(db, jobName);

  const ctx: JobContext = {
    ...options,
    db,
    syncRunId,
    results,
    warnings,
    record: (result) => results.push(result),
    warn: (message) => {
      warnings.push(message);
      console.warn(`  warning: ${message}`);
    },
  };

  try {
    if (options.simulateFailure) {
      throw new Error("Simulated failure requested via --simulate-failure");
    }

    await work(ctx);

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (syncRunId !== null) {
      await finishSyncRun(db, syncRunId, results, warnings);
    }
    console.log(`\n${jobName}: success in ${seconds}s`);
    for (const r of results) console.log(`  ${r.table.padEnd(24)} ${r.rows}`);
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    // An unavailable upstream is not a failure — it is "try again later".
    const skipped =
      error instanceof JobSkipped || error instanceof FplUnavailableError
        ? error instanceof JobSkipped
          ? error.reason
          : "FPL API unavailable (game is being updated)"
        : null;

    if (skipped !== null) {
      if (syncRunId !== null) await skipSyncRun(db, syncRunId, skipped, results);
      console.log(`\n${jobName}: skipped after ${seconds}s — ${skipped}`);
      await db.end({ timeout: 5 });
      return;
    }

    const detail = redactSecrets(errorMessage(error));
    if (syncRunId !== null) {
      await failSyncRun(db, syncRunId, detail).catch(() => {});
    }
    console.error(`\n${jobName}: FAILED after ${seconds}s — ${detail}`);

    // Alerting must never swallow or replace the original error.
    await sendAlert({ jobName, title: "sync failed", detail });

    await db.end({ timeout: 5 }).catch(() => {});
    process.exitCode = 1;
    return;
  }

  await db.end({ timeout: 5 });
}

async function skipSyncRun(
  db: Db,
  runId: number,
  reason: string,
  results: readonly LoadResult[],
): Promise<void> {
  const counts = Object.fromEntries(results.map((r) => [r.table, r.rows]));
  await db`
    update core.sync_runs
    set status = 'skipped', finished_at = now(),
        row_counts = ${db.json({ ...counts, skipped_reason: reason })}, error = null
    where id = ${runId}
  `.catch(() => {});
}
