/**
 * price-sync — the light job, every 3 hours.
 *
 * Fetches bootstrap-static and nothing else, so it stays inside the 45-second
 * target that keeps GitHub Actions billing at one minute a run.
 *
 * It does three things:
 *   1. keeps players current, so a new signing is tradeable within 3 hours
 *   2. writes deduped price telemetry
 *   3. detects STATUS and NEWS changes intraday
 *
 * Point 3 is the reason this job matters. Injury news lands on Thursday and
 * Friday afternoons after press conferences, and deadlines are often Friday
 * evening — detecting it only at 02:37 UTC would deliver it after the
 * deadline, which is worth nothing.
 */
import { detectStateChanges, toPlayerState, ukDate, type DetectedChange } from "@fpl/shared";

import { fetchBootstrap } from "../fpl.ts";
import { clearAlert, lastSuccessfulRun, shouldSendAlert } from "../load/alerts.ts";
import { writeChangeEvents } from "../load/change-events.ts";
import { fetchLatestPlayerStates } from "../load/player-states.ts";
import { loadPriceObservations } from "../load/price-observations.ts";
import { loadPlayerSnapshots } from "../load/snapshots.ts";
import { runJob, type JobContext } from "../runner.ts";
import { sendAlert } from "../telegram.ts";
import { loadIdentity, printDryRunPlan, printEmptyDatabasePlan } from "./shared.ts";

/** How stale a successful daily-sync may get before we are told about it. */
const DAILY_SYNC_MAX_AGE_HOURS = 26;
const DEAD_MAN_ALERT_KEY = "daily-sync-stale";
const DEAD_MAN_COOLDOWN_HOURS = 6;

export async function priceSync(ctx: JobContext): Promise<void> {
  const bootstrap = await fetchBootstrap();
  const today = ukDate();

  const identity = await loadIdentity(ctx.db, bootstrap, ctx.dryRun);
  const loadCtx = identity.ctx;

  if (ctx.dryRun && identity.isEmpty) {
    printEmptyDatabasePlan(bootstrap);
    return;
  }

  if (!ctx.dryRun) {
    ctx.record({ table: "players", rows: bootstrap.elements.length });
  }

  // Compare BEFORE writing today's snapshot, or the comparison is against
  // the values we are about to store.
  const previous = await fetchLatestPlayerStates(ctx.db, loadCtx.seasonId);

  const changes: DetectedChange[] = [];
  for (const element of bootstrap.elements) {
    const before = previous.get(element.id);
    if (!before) continue; // brand new player: nothing to compare against yet
    changes.push(...detectStateChanges(before, toPlayerState(element), today));
  }

  if (ctx.dryRun) {
    printDryRunPlan(
      "status / news changes",
      changes.map((c) => `${c.changeType.padEnd(14)} ${c.dedupKey}  importance ${c.importance}`),
    );
  }

  // Keeps "latest known state" current so the next run does not re-report.
  ctx.record(await loadPlayerSnapshots(loadCtx, bootstrap, today, ctx.dryRun));

  const prices = await loadPriceObservations(loadCtx, bootstrap, new Date(), ctx.dryRun);
  ctx.record(prices);
  if (prices.unchanged > 0) {
    console.log(`  ${prices.unchanged} players unchanged: no price row written`);
  }

  ctx.record(await writeChangeEvents(loadCtx, changes, ctx.syncRunId, ctx.dryRun));

  await deadMansSwitch(ctx);
}

/**
 * Dead man's switch: if daily-sync has not succeeded in over 26 hours, nobody
 * is producing reports and the Supabase project is drifting toward its 7-day
 * inactivity pause. 26 hours, not 24, so a slow run or a DST shift does not
 * cry wolf.
 */
async function deadMansSwitch(ctx: JobContext): Promise<void> {
  const lastSuccess = await lastSuccessfulRun(ctx.db, "daily-sync");
  const ageHours =
    lastSuccess === null ? Infinity : (Date.now() - lastSuccess.getTime()) / 3_600_000;

  if (ageHours <= DAILY_SYNC_MAX_AGE_HOURS) {
    if (!ctx.dryRun) await clearAlert(ctx.db, DEAD_MAN_ALERT_KEY);
    return;
  }

  const when = lastSuccess === null ? "never" : lastSuccess.toISOString();
  const detail =
    `daily-sync has not succeeded in ${ageHours === Infinity ? "any recorded run" : `${ageHours.toFixed(1)}h`}.\n` +
    `last success: ${when}\n` +
    `Reports are not being produced. If this continues for 7 days the Supabase project pauses.`;

  if (ctx.dryRun) {
    console.log(`\n  DRY RUN — would alert: daily-sync stale (${when})`);
    return;
  }

  if (await shouldSendAlert(ctx.db, DEAD_MAN_ALERT_KEY, DEAD_MAN_COOLDOWN_HOURS)) {
    await sendAlert({ jobName: "price-sync", title: "daily-sync is stale", detail });
  } else {
    console.warn("  daily-sync stale, alert suppressed by cooldown");
  }
}

await runJob("price-sync", priceSync);
