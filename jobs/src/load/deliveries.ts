import type { DeliveryKind } from "@fpl/shared";
import type { Db } from "../db.ts";

/**
 * The core.deliveries log (ADR-0006): audit trail for every Make webhook, and
 * the counter behind the per-day news alert cap.
 */

export interface DeliveryRecord {
  kind: DeliveryKind;
  deliveryDate: string;
  ok: boolean;
  httpStatus: number | null;
  messageCount: number;
  eventCount: number;
  reportId: number | null;
  syncRunId: number | null;
  error: string | null;
}

export async function recordDelivery(db: Db, row: DeliveryRecord): Promise<void> {
  await db`
    insert into core.deliveries
      (kind, delivery_date, ok, http_status, message_count, event_count,
       report_id, sync_run_id, error)
    values
      (${row.kind}, ${row.deliveryDate}::date, ${row.ok}, ${row.httpStatus},
       ${row.messageCount}, ${row.eventCount}, ${row.reportId}, ${row.syncRunId},
       ${row.error})
  `;
}

/**
 * Deliveries of one kind on one UK date — successful ones only, unless
 * `includeFailed`: the AI cap counts every attempt, because a call that
 * failed late may still have spent a Gemini request.
 */
export async function countDeliveries(
  db: Db,
  kind: DeliveryKind,
  deliveryDate: string,
  includeFailed = false,
): Promise<number> {
  const [row] = await db<{ n: string }[]>`
    select count(*) as n from core.deliveries
    where kind = ${kind} and delivery_date = ${deliveryDate}::date
      and (ok or ${includeFailed})
  `;
  return Number(row?.n ?? 0);
}

/** Has this gameweek's preview already reached the channel? */
export async function previewDelivered(db: Db, gameweek: number): Promise<boolean> {
  const [row] = await db<{ n: string }[]>`
    select count(*) as n
    from core.deliveries d
    join core.reports r on r.id = d.report_id
    where d.kind = 'preview' and d.ok
      and r.report_type = 'preview' and r.gameweek = ${gameweek}
  `;
  return Number(row?.n ?? 0) > 0;
}

/**
 * Freezes the delivered events: writeChangeEvents never refreshes a row once
 * notified_at is set. An event already marked keeps its ORIGINAL time — a
 * news alert followed by the daily recap is one notification, not two.
 */
export async function markNotified(db: Db, eventIds: readonly number[]): Promise<number> {
  if (eventIds.length === 0) return 0;
  const rows = await db`
    update core.change_events set notified_at = now()
    where id = any(${[...eventIds]}::bigint[]) and notified_at is null
    returning id
  `;
  return rows.length;
}
