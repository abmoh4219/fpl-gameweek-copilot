import type { Db } from "../db.ts";

/**
 * Alert de-duplication. A condition that persists must not page on every run,
 * but the FIRST occurrence after recovery must page immediately — so the row
 * is deleted when the condition clears rather than left to age out.
 */

export async function shouldSendAlert(
  db: Db,
  key: string,
  cooldownHours: number,
): Promise<boolean> {
  const [row] = await db<{ last_sent_at: Date }[]>`
    select last_sent_at from core.alert_state where key = ${key}
  `;

  if (row) {
    const ageHours = (Date.now() - row.last_sent_at.getTime()) / 3_600_000;
    if (ageHours < cooldownHours) return false;
  }

  await db`
    insert into core.alert_state (key, last_sent_at, updated_at)
    values (${key}, now(), now())
    on conflict (key) do update set last_sent_at = now(), updated_at = now()
  `;
  return true;
}

/** Called when the condition clears, so the next failure alerts at once. */
export async function clearAlert(db: Db, key: string): Promise<void> {
  await db`delete from core.alert_state where key = ${key}`;
}

/** When did the named job last finish successfully? */
export async function lastSuccessfulRun(db: Db, jobName: string): Promise<Date | null> {
  const [row] = await db<{ finished_at: Date | null }[]>`
    select max(finished_at) as finished_at
    from core.sync_runs
    where job_name = ${jobName} and status = 'success'
  `;
  return row?.finished_at ?? null;
}
