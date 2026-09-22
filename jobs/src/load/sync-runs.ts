import type { Db } from "../db.ts";
import type { LoadResult } from "./context.ts";

/**
 * Every run is recorded, including runs that wrote no price_observations.
 * That is what makes the price dedup lossless: absence of a row means
 * "unchanged", not "not observed".
 */
export async function startSyncRun(db: Db, jobName: string): Promise<number> {
  const [row] = await db<{ id: string }[]>`
    insert into core.sync_runs (job_name, status)
    values (${jobName}, 'running')
    returning id
  `;
  if (!row) throw new Error("Failed to open a sync run");
  return Number(row.id);
}

export async function finishSyncRun(
  db: Db,
  runId: number,
  results: readonly LoadResult[],
  warnings: readonly string[] = [],
): Promise<void> {
  const counts: Record<string, unknown> = Object.fromEntries(
    results.map((r) => [r.table, r.rows]),
  );
  // Optional data that failed is recorded here, not as a run failure
  // (CLAUDE.md §10) — so a Champions League outage is visible but harmless.
  if (warnings.length > 0) counts["warnings"] = warnings;

  await db`
    update core.sync_runs
    set status = 'success', finished_at = now(), row_counts = ${db.json(counts as never)}
    where id = ${runId}
  `;
}

export async function failSyncRun(db: Db, runId: number, error: string): Promise<void> {
  await db`
    update core.sync_runs
    set status = 'failed', finished_at = now(), error = ${error}
    where id = ${runId}
  `;
}
