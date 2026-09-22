/**
 * preview — builds the pre-deadline gameweek preview.
 *
 * Manual for now (`pnpm job:preview`): previews are worth reading a day or
 * two before a deadline, not on a fixed clock, and there are only about five
 * a month. Phase 6 hands the payload to Gemini for prose; this block is
 * template-only.
 */
import { fetchBootstrap } from "../fpl.ts";
import { saveReport } from "../load/reports.ts";
import { loadGameweeks } from "../load/reference.ts";
import { buildPreviewReportFrom } from "../reports/build.ts";
import { JobSkipped, runJob, type JobContext } from "../runner.ts";
import { fetchGameweekIds, loadIdentity, printDryRunPlan, printEmptyDatabasePlan } from "./shared.ts";

export async function preview(ctx: JobContext): Promise<void> {
  const bootstrap = await fetchBootstrap();

  // Preview the gameweek that has not started yet.
  const target =
    bootstrap.events.find((e) => e.is_next) ??
    bootstrap.events.find((e) => !e.finished);
  if (!target) throw new JobSkipped("no upcoming gameweek to preview");

  console.log(`  previewing GW${target.id} (deadline ${target.deadline_time})`);

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

  const report = await buildPreviewReportFrom(ctx.db, target.id, target.deadline_time);
  ctx.record(await saveReport(ctx.db, report, ctx.dryRun));

  if (ctx.dryRun) {
    printDryRunPlan("gameweek preview", [
      report.payload.headline,
      ...Object.entries(report.payload.summary).map(([k, v]) => `${k}: ${v}`),
      `X draft (${report.payload.xPost.length} chars): ${report.payload.xPost}`,
    ]);
  }
}

await runJob("preview", preview);
