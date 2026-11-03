import type { Metadata } from "next";
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
        <div className="sec-head">
          <span className="sec-kicker">
            <b>Stats</b>
            Season leaderboards
          </span>
          <h1 className="display">
            Who&apos;s actually <em>delivering.</em>
          </h1>
          <p className="sub">
            Every Premier League player in the game, ranked on the numbers that matter for FPL. Filter by position and
            price{updated ? `, updated ${updatedLabel(updated)}` : ""}.
          </p>
        </div>
        {rows.length > 0 ? (
          <>
            <StatsInsights rows={rows} />
            <h2 className="stats-h2">Leaderboards</h2>
            <StatsHub rows={rows} />
          </>
        ) : (
          <div className="notice error">The stats aren&apos;t available right now. Try again in a few minutes.</div>
        )}
      </div>
    </section>
  );
}
