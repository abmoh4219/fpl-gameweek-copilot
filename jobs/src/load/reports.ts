import type { BuiltReport } from "@fpl/shared";
import type { Db } from "../db.ts";
import type { LoadResult } from "./context.ts";

/**
 * Store a rendered report. Upserts on the report's natural key so re-running
 * a job replaces the day's (or gameweek's) report rather than duplicating it.
 */
export async function saveReport(
  db: Db,
  report: BuiltReport,
  dryRun = false,
): Promise<LoadResult> {
  if (dryRun) return { table: `reports(${report.payload.type})`, rows: 1 };

  const { payload, messages } = report;
  const text = messages.join("\n\n———\n\n");

  if (payload.type === "daily") {
    await db`
      insert into core.reports (report_type, report_date, gameweek, payload, text, generated_by)
      values ('daily', ${payload.date}::date, ${payload.gameweek},
              ${db.json(payload as never)}, ${text}, 'template')
      on conflict (report_type, report_date) where report_type = 'daily'
      do update set payload = excluded.payload, text = excluded.text,
                    gameweek = excluded.gameweek, updated_at = now()
    `;
  } else {
    await db`
      insert into core.reports (report_type, report_date, gameweek, payload, text, generated_by)
      values ('preview', ${payload.date}::date, ${payload.gameweek},
              ${db.json(payload as never)}, ${text}, 'template')
      on conflict (report_type, gameweek) where report_type = 'preview'
      do update set payload = excluded.payload, text = excluded.text,
                    report_date = excluded.report_date, updated_at = now()
    `;
  }

  return { table: `reports(${payload.type})`, rows: 1 };
}
