/**
 * daily-sync — the full job, once a day at 02:37 UTC.
 *
 * Runs after the ~01:30 UK price change in both BST and GMT, and does
 * everything price-sync does not: fixtures, per-gameweek stats, Champions
 * League congestion data, day-over-day change detection, and retention.
 */
import {
  detectDailyChanges,
  detectStateChanges,
  toPlayerState,
  ukDate,
  ukDateMinus,
  type DetectedChange,
} from "@fpl/shared";

import { fetchBootstrap, fetchClMatches, fetchEventLive, fetchFixtures } from "../fpl.ts";
import { clearAlert } from "../load/alerts.ts";
import { writeChangeEvents } from "../load/change-events.ts";
import { loadClFixtures } from "../load/cl-fixtures.ts";
import { loadPlayerGameweekStats } from "../load/gameweek-stats.ts";
import { fetchLatestPlayerStates, fetchPlayerStatesBefore } from "../load/player-states.ts";
import { loadPriceObservations } from "../load/price-observations.ts";
import { loadFixtures, loadGameweeks } from "../load/reference.ts";
import { loadPlayerSnapshots } from "../load/snapshots.ts";
import { errorMessage } from "../http.ts";
import { saveReport } from "../load/reports.ts";
import { buildDailyReportFrom } from "../reports/build.ts";
import { JobSkipped, runJob, type JobContext } from "../runner.ts";
import { fetchGameweekIds, loadIdentity, printDryRunPlan, printEmptyDatabasePlan } from "./shared.ts";

/**
 * Cap on live-stat fetches per run. A backlog after an outage catches up over
 * several days rather than blowing the runtime in one go; the cap is logged
 * and docs/operations.md explains how to backfill deliberately.
 */
const MAX_LIVE_GAMEWEEKS_PER_RUN = 5;

/** Champions League lookback — see CLAUDE.md §6 for why it is this long. */
const CL_LOOKBACK_DAYS = 35;

export async function dailySync(ctx: JobContext): Promise<void> {
  const bootstrap = await fetchBootstrap();

  const current = bootstrap.events.find((e) => e.is_current);
  const next = bootstrap.events.find((e) => e.is_next);
  if (!current && !next) {
    throw new JobSkipped("off-season: no current or next gameweek");
  }

  const today = ukDate();
  const identity = await loadIdentity(ctx.db, bootstrap, ctx.dryRun);
  const loadCtx = identity.ctx;

  if (ctx.dryRun && identity.isEmpty) {
    const fixtures = await fetchFixtures();
    printEmptyDatabasePlan(bootstrap, { fixtures: fixtures.length });
    return;
  }

  if (!ctx.dryRun) ctx.record({ table: "players", rows: bootstrap.elements.length });

  // Gameweeks must land before fixtures, which reference them.
  if (!ctx.dryRun) {
    const { result } = await loadGameweeks(ctx.db, loadCtx.seasonId, bootstrap);
    ctx.record(result);
    loadCtx.gameweekIds = await fetchGameweekIds(ctx.db, loadCtx.seasonId);
  }

  ctx.record(await loadFixtures(loadCtx, await fetchFixtures(), ctx.dryRun));

  // ---- change detection -----------------------------------------------------
  // Day-over-day fields compare against YESTERDAY; status and news compare
  // against the latest known state, which price-sync may have refreshed
  // hours ago. That split is what stops an injury being reported twice.
  const yesterday = await fetchPlayerStatesBefore(ctx.db, loadCtx.seasonId, today);
  const latest = await fetchLatestPlayerStates(ctx.db, loadCtx.seasonId);

  const changes: DetectedChange[] = [];
  for (const element of bootstrap.elements) {
    const state = toPlayerState(element);
    const priorDay = yesterday.get(element.id);
    const priorState = latest.get(element.id);
    if (priorState) changes.push(...detectStateChanges(priorState, state, today));
    if (priorDay) changes.push(...detectDailyChanges(priorDay, state, today));
  }

  if (ctx.dryRun) {
    printDryRunPlan(
      "change events",
      changes.map((c) => `${c.changeType.padEnd(16)} ${c.dedupKey}  importance ${c.importance}`),
    );
  }

  ctx.record(await loadPlayerSnapshots(loadCtx, bootstrap, today, ctx.dryRun));
  ctx.record(await loadPriceObservations(loadCtx, bootstrap, new Date(), ctx.dryRun));
  ctx.record(await writeChangeEvents(loadCtx, changes, ctx.syncRunId, ctx.dryRun));

  // ---- per-gameweek stats ---------------------------------------------------
  await loadLiveGameweeks(ctx, loadCtx, bootstrap, current?.id);

  // ---- Champions League (optional) -----------------------------------------
  await loadChampionsLeague(ctx, loadCtx);

  // ---- daily report ---------------------------------------------------------
  // Built AFTER change detection so it reads the events this run just wrote.
  const report = await buildDailyReportFrom(ctx.db, {
    date: today,
    gameweek: current?.id ?? next?.id ?? null,
  });
  ctx.record(await saveReport(ctx.db, report, ctx.dryRun));
  if (ctx.dryRun) {
    printDryRunPlan("daily report", [
      report.payload.headline,
      ...Object.entries(report.payload.summary).map(([k, v]) => `${k}: ${v}`),
      `X draft (${report.payload.xPost.length} chars): ${report.payload.xPost}`,
    ]);
  }

  // ---- retention ------------------------------------------------------------
  if (!ctx.dryRun) {
    const [pruned] = await ctx.db<{ summarised_days: number; deleted_rows: string }[]>`
      select * from core.prune_price_observations(60)
    `;
    ctx.record({ table: "price_observations_pruned", rows: Number(pruned?.deleted_rows ?? 0) });
  }

  // A successful run clears the dead man's switch immediately.
  if (!ctx.dryRun) await clearAlert(ctx.db, "daily-sync-stale");
}

/**
 * The current gameweek, plus any earlier finished gameweek FPL has not yet
 * marked data_checked (bonus and stats still settling).
 */
async function loadLiveGameweeks(
  ctx: JobContext,
  loadCtx: Awaited<ReturnType<typeof loadIdentity>>["ctx"],
  bootstrap: Awaited<ReturnType<typeof fetchBootstrap>>,
  currentId: number | undefined,
): Promise<void> {
  const pending = bootstrap.events
    .filter((e) => e.finished && !e.data_checked)
    .map((e) => e.id);
  if (currentId !== undefined && !pending.includes(currentId)) pending.push(currentId);

  const ordered = [...new Set(pending)].sort((a, b) => a - b);
  const selected = ordered.slice(0, MAX_LIVE_GAMEWEEKS_PER_RUN);

  if (ordered.length > selected.length) {
    ctx.warn(
      `${ordered.length} gameweeks need live stats; fetching ${selected.length} this run ` +
        `(cap ${MAX_LIVE_GAMEWEEKS_PER_RUN}). Remaining: ${ordered.slice(selected.length).join(", ")}`,
    );
  }

  for (const gameweek of selected) {
    const live = await fetchEventLive(gameweek);
    const result = await loadPlayerGameweekStats(loadCtx, live, gameweek, ctx.dryRun);
    ctx.record({ table: `player_gameweek_stats(gw${gameweek})`, rows: result.rows });
  }
}

/**
 * Optional data: a failure here is a warning on the run, never a failed run
 * and never a Telegram alert (CLAUDE.md §10).
 */
async function loadChampionsLeague(
  ctx: JobContext,
  loadCtx: Awaited<ReturnType<typeof loadIdentity>>["ctx"],
): Promise<void> {
  const token = process.env["FOOTBALL_DATA_API_TOKEN"];
  if (!token) {
    ctx.warn("FOOTBALL_DATA_API_TOKEN not set, Champions League congestion data skipped");
    return;
  }

  try {
    // One request. Backward for matches already played, forward to the end of
    // the season with no artificial limit.
    const from = ukDateMinus(CL_LOOKBACK_DAYS);
    const to = ukDateMinus(-330);
    const matches = await fetchClMatches(token, from, to);
    ctx.record(await loadClFixtures(loadCtx, matches, ctx.dryRun));
  } catch (error) {
    ctx.warn(`Champions League sync failed, continuing without it: ${errorMessage(error)}`);
  }
}

await runJob("daily-sync", dailySync);
