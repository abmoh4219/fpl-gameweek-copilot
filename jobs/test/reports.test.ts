import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../src/db.ts";
import { saveReport } from "../src/load/reports.ts";
import { buildDailyReportFrom, buildPreviewReportFrom } from "../src/reports/build.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

describe.skipIf(!stack)(`reports (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    });
  });

  afterAll(async () => {
    await db`delete from core.reports where report_date = '2026-09-22'::date`;
    await db.end({ timeout: 5 });
  });

  it("builds a daily report with structured sections from real view data", async () => {
    const report = await buildDailyReportFrom(db, { date: "2026-09-22", gameweek: 6 });

    expect(report.payload.type).toBe("daily");
    expect(report.payload.sections.length).toBeGreaterThan(0);
    expect(report.messages.length).toBeGreaterThanOrEqual(1);
    expect(report.payload.xPost.length).toBeLessThanOrEqual(240);
  });

  it("stores the report once, and re-running replaces it", async () => {
    const report = await buildDailyReportFrom(db, { date: "2026-09-22", gameweek: 6 });

    await saveReport(db, report);
    await saveReport(db, report);
    await saveReport(db, report);

    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from core.reports
      where report_type = 'daily' and report_date = '2026-09-22'::date
    `;
    expect(row!.n).toBe(1);
  });

  it("writes nothing in a dry run", async () => {
    await db`delete from core.reports where report_date = '2026-09-22'::date`;
    const report = await buildDailyReportFrom(db, { date: "2026-09-22", gameweek: 6 });

    const result = await saveReport(db, report, true);

    expect(result.rows).toBe(1);
    const [row] = await db<{ n: number }[]>`select count(*)::int as n from core.reports`;
    expect(row!.n).toBe(0);
  });

  it("stores a preview keyed by gameweek", async () => {
    const preview = await buildPreviewReportFrom(db, 6, "2026-10-10T10:00:00Z");
    await saveReport(db, preview);
    await saveReport(db, preview);

    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from core.reports where report_type = 'preview' and gameweek = 6
    `;
    expect(row!.n).toBe(1);
    await db`delete from core.reports where report_type = 'preview' and gameweek = 6`;
  });

  it("never leaks momentum or the hourly rate into a payload", async () => {
    const report = await buildDailyReportFrom(db, { date: "2026-09-22", gameweek: 6 });
    const json = JSON.stringify(report.payload);
    // The hypothesis behind these is unvalidated; reports must not use them.
    expect(json).not.toContain("momentum");
    expect(json).not.toContain("hourlyRate");
    expect(json).not.toContain("hourly_rate");
  });
});

describe.skipIf(!stack)(`api.latest_reports (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    const report = await buildDailyReportFrom(db, { date: "2026-09-22", gameweek: 6 });
    await saveReport(db, report);
  });

  afterAll(async () => {
    await db`delete from core.reports where report_date = '2026-09-22'::date`;
    await db.end({ timeout: 5 });
  });

  it("anon can read the latest report through the api view", async () => {
    const res = await fetch(`${stack!.apiUrl}/rest/v1/latest_reports?select=*`, {
      headers: { apikey: stack!.anonKey, Authorization: `Bearer ${stack!.anonKey}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { report_type: string; payload: { sections: unknown[] } }[];
    const daily = body.find((r) => r.report_type === "daily");
    expect(daily).toBeDefined();
    // The site renders these sections directly.
    expect(Array.isArray(daily!.payload.sections)).toBe(true);
  });

  it("anon cannot read core.reports directly", async () => {
    const res = await fetch(`${stack!.apiUrl}/rest/v1/reports?select=*`, {
      headers: {
        apikey: stack!.anonKey,
        Authorization: `Bearer ${stack!.anonKey}`,
        "Accept-Profile": "core",
      },
    });
    expect(res.ok).toBe(false);
  });

  it("anon cannot write a report", async () => {
    const res = await fetch(`${stack!.apiUrl}/rest/v1/latest_reports`, {
      method: "POST",
      headers: {
        apikey: stack!.anonKey,
        Authorization: `Bearer ${stack!.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ report_type: "daily" }),
    });
    expect(res.ok).toBe(false);
  });
});
