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
): Promise<LoadResult & { id: number | null }> {
  if (dryRun) return { table: `reports(${report.payload.type})`, rows: 1, id: null };

  const { payload, messages } = report;
  const text = messages.join("\n\n———\n\n");
  // Only validated prose ever reaches payload.prose (ADR-0007).
  const generatedBy = payload.prose ? "ai" : "template";

  let rows: { id: string }[];
  if (payload.type === "daily") {
    rows = await db`
      insert into core.reports (report_type, report_date, gameweek, payload, text, generated_by)
      values ('daily', ${payload.date}::date, ${payload.gameweek},
              ${db.json(payload as never)}, ${text}, ${generatedBy})
      on conflict (report_type, report_date) where report_type = 'daily'
      do update set payload = excluded.payload, text = excluded.text,
                    generated_by = excluded.generated_by,
                    gameweek = excluded.gameweek, updated_at = now()
      returning id
    `;
  } else {
    rows = await db`
      insert into core.reports (report_type, report_date, gameweek, payload, text, generated_by)
      values ('preview', ${payload.date}::date, ${payload.gameweek},
              ${db.json(payload as never)}, ${text}, ${generatedBy})
      on conflict (report_type, gameweek) where report_type = 'preview'
      do update set payload = excluded.payload, text = excluded.text,
                    generated_by = excluded.generated_by,
                    report_date = excluded.report_date, updated_at = now()
      returning id
    `;
  }

  return { table: `reports(${payload.type})`, rows: 1, id: rows[0] ? Number(rows[0].id) : null };
}
