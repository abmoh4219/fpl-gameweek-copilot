import type { Metadata } from "next";
import Link from "next/link";
import { STAT_COLUMNS, statRowFromView, type StatRow, type StatViewRow } from "@fpl/shared";
import { StatsHub } from "@/components/stats/StatsHub";
import { StatsInsights } from "@/components/stats/StatsInsights";
import { readView } from "@/lib/supabase";
import "./stats.css";

export const metadata: Metadata = {
  title: "FPL stats",
  description: "Free Fantasy Premier League leaderboards: goals, assists, xG, xA, xGI per 90, points, form, value, bonus, clean sheets and ownership, filtered by position and price.",
};

// The pipeline refreshes every three hours; an hour of cache keeps visitors off the database.
export const revalidate = 3600;

async function stats(): Promise<{ rows: StatRow[]; updated: string | null }> {
  const raw = await readView<StatViewRow & { snapshot_date: string }>("player_current", `select=${STAT_COLUMNS.join(",")},snapshot_date`, 3600).catch(() => []);
  const rows = raw.flatMap((r) => statRowFromView(r) ?? []);
  const updated = raw.reduce<string | null>((max, r) => (max === null || r.snapshot_date > max ? r.snapshot_date : max), null);
  return { rows, updated };
}

/** "today", "yesterday", else "2 November". Snapshot dates are UTC calendar days; the page re-renders hourly. */
function updatedLabel(snapshotDate: string): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (snapshotDate === day(today)) return "today";
  if (snapshotDate === day(yesterday)) return "yesterday";
  return new Date(`${snapshotDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export default async function StatsPage() {
  const { rows, updated } = await stats();
  return (
    <section className="block stats-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Stats</h1>
          <p>Every player ranked on the numbers that matter for FPL{updated ? `, updated ${updatedLabel(updated)}` : ""}</p>
          <p className="tool-share">
            <Link href="/cards/transfers">Transfer radar card</Link>
            <Link href="/cards/template">Template XI card</Link>
          </p>
        </header>
        {rows.length > 0 ? (
          <>
            <StatsHub rows={rows} />
            <h2 className="tool-h2">Insights</h2>
            <StatsInsights rows={rows} />
          </>
        ) : (
          <div className="notice error">The stats aren&apos;t available right now. Try again in a few minutes.</div>
        )}
      </div>
    </section>
  );
}
