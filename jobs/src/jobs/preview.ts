/**
 * preview — the pre-deadline gameweek preview (ADR-0007).
 *
 * Runs once a day from .github/workflows/preview.yml and does nothing until
 * the next deadline is within INSIGHT_CONFIG.preview.sendWithinHours, then
 * sends that gameweek's preview exactly once. About five a month.
 *
 *   1. compute the template preview — every number comes from code
 *   2. ask Scenario 2 for an opening paragraph from those facts (Gemini)
 *   3. VALIDATE it in code; any failure, or the daily cap, ships the template
 *   4. store it, then deliver through Scenario 1 like every other report
 *
 * `--force` (or PREVIEW_FORCE=true) skips the deadline window, for a manual
 * run. It never skips the once-per-gameweek rule.
 */
import {
  INSIGHT_CONFIG,
  previewDelivery,
  previewFacts,
  previewPrompt,
  ukDate,
  validateProse,
  withProse,
  type BuiltReport,
} from "@fpl/shared";

import { deliver } from "../deliver.ts";
import { fetchBootstrap } from "../fpl.ts";
import { countDeliveries, previewDelivered, recordDelivery } from "../load/deliveries.ts";
import { saveReport } from "../load/reports.ts";
import { loadGameweeks } from "../load/reference.ts";
import { requestProse, webhookTarget } from "../make.ts";
import { buildPreviewReportFrom } from "../reports/build.ts";
import { JobSkipped, runJob, type JobContext } from "../runner.ts";
import { fetchGameweekIds, loadIdentity, printDryRunPlan, printEmptyDatabasePlan } from "./shared.ts";

export async function preview(ctx: JobContext): Promise<void> {
  const bootstrap = await fetchBootstrap();
  const force = process.argv.includes("--force") || process.env["PREVIEW_FORCE"] === "true";

  // Preview the gameweek that has not started yet.
  const target =
    bootstrap.events.find((e) => e.is_next) ??
    bootstrap.events.find((e) => !e.finished);
  if (!target) throw new JobSkipped("no upcoming gameweek to preview");

  const hoursLeft = (Date.parse(target.deadline_time) - Date.now()) / 3_600_000;
  const window = INSIGHT_CONFIG.preview.sendWithinHours;
  console.log(`  GW${target.id} deadline ${target.deadline_time} (${hoursLeft.toFixed(1)}h away)`);

  if (!force && hoursLeft > window) {
    throw new JobSkipped(`GW${target.id} deadline is ${hoursLeft.toFixed(0)}h away; previews go out inside ${window}h`);
  }
  if (!ctx.dryRun && (await previewDelivered(ctx.db, target.id))) {
    throw new JobSkipped(`GW${target.id} preview already delivered`);
  }

  const identity = await loadIdentity(ctx.db, bootstrap, ctx.dryRun);
  const loadCtx = identity.ctx;

  if (ctx.dryRun && identity.isEmpty) {
    printEmptyDatabasePlan(bootstrap);
    return;
  }

  if (!ctx.dryRun) {
    const { result } = await loadGameweeks(ctx.db, loadCtx.seasonId, bootstrap);
    ctx.record(result);
    loadCtx.gameweekIds = await fetchGameweekIds(ctx.db, loadCtx.seasonId);
  }

  const template = await buildPreviewReportFrom(ctx.db, target.id, target.deadline_time);
  const report = await addAiProse(ctx, template, target.deadline_time);

  const saved = await saveReport(ctx.db, report, ctx.dryRun);
  ctx.record(saved);

  if (ctx.dryRun) {
    printDryRunPlan("gameweek preview", [
      report.payload.headline,
      ...Object.entries(report.payload.summary).map(([k, v]) => `${k}: ${v}`),
      `X draft (${report.payload.xPost.length} chars): ${report.payload.xPost}`,
    ]);
  }

  await deliver(ctx, {
    jobName: "preview",
    date: ukDate(),
    payload: previewDelivery(report),
    eventIds: [],
    reportId: saved.id,
  });
}

/**
 * The AI step. Returns the template unchanged on ANY problem — the preview
 * ships either way (CLAUDE.md §7). Each attempt is a `preview_ai` row in
 * core.deliveries, which is what the daily cap counts.
 */
async function addAiProse(
  ctx: JobContext,
  template: BuiltReport,
  deadlineUtc: string,
): Promise<BuiltReport> {
  const cfg = INSIGHT_CONFIG.ai;
  const facts = previewFacts(template.payload, deadlineUtc);
  const prompt = previewPrompt(facts);
  const today = ukDate();

  if (ctx.dryRun) {
    printDryRunPlan("AI prose (not requested in a dry run)", [`prompt: ${prompt.length} chars`]);
    return template;
  }

  const target = webhookTarget("preview");
  if ("missing" in target) {
    ctx.warn(`${target.missing.join(", ")} not set, preview ships as template`);
    return template;
  }

  const used = await countDeliveries(ctx.db, "preview_ai", today, true);
  if (used >= cfg.maxCallsPerDay) {
    ctx.warn(`AI cap of ${cfg.maxCallsPerDay} calls/day reached, preview ships as template`);
    return template;
  }

  const result = await requestProse(
    target,
    { version: 1, gameweek: template.payload.gameweek ?? 0, prompt },
    cfg.timeoutMs,
  );
  const check = result.text === null ? null : validateProse(result.text, facts);

  await recordDelivery(ctx.db, {
    kind: "preview_ai",
    deliveryDate: today,
    ok: check?.ok ?? false,
    httpStatus: result.status,
    messageCount: 0,
    eventCount: 0,
    reportId: null,
    syncRunId: ctx.syncRunId,
    error: result.error ?? (check && !check.ok ? `rejected: ${check.reason}` : null),
  });

  if (!check) {
    ctx.warn(`Scenario 2 failed (${result.error}), preview ships as template`);
    return template;
  }
  if (!check.ok) {
    ctx.warn(`AI prose rejected (${check.reason}), preview ships as template`);
    return template;
  }

  ctx.record({ table: "ai_prose", rows: 1 });
  return withProse(template, check.prose);
}

await runJob("preview", preview);
