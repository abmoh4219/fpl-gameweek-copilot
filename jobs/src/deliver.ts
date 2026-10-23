/**
 * Sends one delivery to Make and records what happened (ADR-0006).
 *
 * Delivery is the LAST step of a run and never fails it: the data is already
 * stored, and a failed run would trip the dead man's switch over what is a
 * Make problem. A failed POST is still loud — it alerts Telegram directly,
 * because Make is exactly the thing that may be broken.
 */
import type { DeliveryPayload } from "@fpl/shared";
import { clearAlert, shouldSendAlert } from "./load/alerts.ts";
import { markNotified, recordDelivery } from "./load/deliveries.ts";
import { eventsWebhookTarget, postToMake } from "./make.ts";
import { printDryRunPlan } from "./jobs/shared.ts";
import type { JobContext } from "./runner.ts";
import { sendAlert } from "./telegram.ts";

const DELIVERY_ALERT_KEY = "make-delivery-failed";
const DELIVERY_ALERT_COOLDOWN_HOURS = 6;

export interface DeliveryInput {
  jobName: string;
  /** UK date the delivery belongs to. */
  date: string;
  payload: DeliveryPayload;
  /** change_events to mark notified once Make has accepted the payload. */
  eventIds: readonly number[];
  reportId: number | null;
}

/** Returns true only when Make accepted the payload. */
export async function deliver(ctx: JobContext, input: DeliveryInput): Promise<boolean> {
  const { payload } = input;

  if (ctx.dryRun) {
    printDryRunPlan(`webhook ${payload.kind}`, [
      payload.headline,
      `${payload.messages.length} message(s), ${payload.messages.join("").length} chars`,
      payload.xDraft ? `X draft: ${payload.xDraft}` : "no X draft",
      `would mark ${input.eventIds.length} change events notified`,
    ]);
    return false;
  }

  const target = eventsWebhookTarget();
  if ("missing" in target) {
    ctx.warn(`${target.missing.join(", ")} not set, ${payload.kind} not delivered`);
    return false;
  }

  const result = await postToMake(target, payload);

  await recordDelivery(ctx.db, {
    kind: payload.kind,
    deliveryDate: input.date,
    ok: result.ok,
    httpStatus: result.status,
    messageCount: payload.messages.length,
    eventCount: payload.eventCount,
    reportId: input.reportId,
    syncRunId: ctx.syncRunId,
    error: result.error,
  });

  if (result.ok) {
    const marked = await markNotified(ctx.db, input.eventIds);
    ctx.record({ table: `delivered(${payload.kind})`, rows: payload.messages.length });
    ctx.record({ table: "change_events_notified", rows: marked });
    await clearAlert(ctx.db, DELIVERY_ALERT_KEY);
    return true;
  }

  const detail = `${payload.kind} was not delivered to Make: ${result.error ?? "unknown error"}`;
  ctx.warn(detail);
  if (await shouldSendAlert(ctx.db, DELIVERY_ALERT_KEY, DELIVERY_ALERT_COOLDOWN_HOURS)) {
    await sendAlert({ jobName: input.jobName, title: "delivery failed", detail });
  }
  return false;
}
