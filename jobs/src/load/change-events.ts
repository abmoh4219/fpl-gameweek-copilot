import type { DetectedChange } from "@fpl/shared";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Persist detected changes.
 *
 * The unique constraint on dedup_key is what makes "never stored or sent
 * twice" true. On conflict we REFRESH the row, but only while notified_at is
 * still null: once Phase 5 has delivered an event, re-running detection must
 * not rewrite what was sent.
 */
export async function writeChangeEvents(
  ctx: LoadContext,
  changes: readonly DetectedChange[],
  syncRunId: number | null,
  dryRun = false,
): Promise<LoadResult> {
  if (changes.length === 0 || dryRun) {
    return { table: "change_events", rows: changes.length };
  }

  const rows = changes.flatMap((change) => {
    const playerId = ctx.playerIds.get(change.playerFplId);
    if (playerId === undefined) return [];
    return [
      {
        dedup_key: change.dedupKey,
        player_id: playerId,
        change_type: change.changeType,
        occurred_on: change.occurredOn,
        old_value: ctx.db.json(change.oldValue as never),
        new_value: ctx.db.json(change.newValue as never),
        importance: change.importance,
        sync_run_id: syncRunId,
      },
    ];
  });

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.change_events ${ctx.db(
        batch,
        "dedup_key", "player_id", "change_type", "occurred_on",
        "old_value", "new_value", "importance", "sync_run_id",
      )}
      on conflict (dedup_key) do update set
        old_value   = excluded.old_value,
        new_value   = excluded.new_value,
        importance  = excluded.importance,
        detected_at = now()
      where core.change_events.notified_at is null
    `;
  }

  return { table: "change_events", rows: rows.length };
}
