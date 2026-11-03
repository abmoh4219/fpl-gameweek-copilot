import type { Metadata } from "next";
import { fixtureGrid, type CongestionMark, type RunScore, type TeamRun, type TeamTarget, type TickerViewRow } from "@fpl/shared";
import { FixturePlanner } from "@/components/fixtures/FixturePlanner";
import { FixtureSwings } from "@/components/fixtures/FixtureSwings";
import { TeamTargets } from "@/components/fixtures/TeamTargets";
import { readView } from "@/lib/supabase";
import "./fixtures.css";

export const metadata: Metadata = {
  title: "FPL fixture planner",
  description: "Every Premier League club's next five gameweeks, colour-coded by difficulty and sorted by the easiest run, with Champions League congestion marked.",
};

export const revalidate = 3600;

async function plannerData() {
  const [ticker, runRows, congestion, xgRows] = await Promise.all([
    readView<TickerViewRow>(
      "fixture_ticker",
      "select=team_fpl_id,team_short_name,gameweek,kickoff_utc,is_home,opponent_short_name,difficulty,is_blank&order=gameweek",
      3600,
    ).catch(() => []),
    readView<{ team_fpl_id: number; team_code: number; run: TeamRun }>("team_runs", "select=team_fpl_id,team_code,run", 3600).catch(() => []),
    readView<{ team_fpl_id: number; kickoff_utc: string; days_since_cl: number | null }>(
      "cl_congestion",
      "select=team_fpl_id,kickoff_utc,days_since_cl&is_after_cl=is.true",
      3600,
    ).catch(() => []),
    readView<{ team_fpl_id: number; team_short_name: string; expected_goals: number | string }>(
      "player_current",
      "select=team_fpl_id,team_short_name,expected_goals",
      3600,
    ).catch(() => []),
  ]);
  const runs: RunScore[] = runRows
    .filter((r) => r.run?.short && r.run?.long)
    .map((r) => ({
      teamFplId: r.team_fpl_id,
      teamCode: r.team_code,
      next3: r.run.short.adjustedDifficulty,
      next5: r.run.long.adjustedDifficulty,
      band3: r.run.short.band,
      band5: r.run.long.band,
    }));
  const marks: CongestionMark[] = congestion.map((c) => ({ teamFplId: c.team_fpl_id, kickoffUtc: c.kickoff_utc, daysSinceCl: c.days_since_cl }));
  // A club's season attack: its players' xG summed (players who left are still counted).
  const xgByTeam = new Map<number, { team: string; xg: number }>();
  for (const r of xgRows) {
    const t = xgByTeam.get(r.team_fpl_id) ?? { team: r.team_short_name, xg: 0 };
    t.xg += Number(r.expected_goals) || 0;
    xgByTeam.set(r.team_fpl_id, t);
  }
  const targets: TeamTarget[] = runs.flatMap((r) => {
    const t = xgByTeam.get(r.teamFplId);
    return t ? [{ teamFplId: r.teamFplId, team: t.team, xg: Math.round(t.xg * 10) / 10, next5: r.next5 }] : [];
  });
  return { ...fixtureGrid(ticker, runs, marks), targets };
}

export default async function FixturesPage() {
  const { gameweeks, rows, targets } = await plannerData();
  return (
    <section className="block fixtures-page">
      <div className="wrap">
        <div className="sec-head">
          <span className="sec-kicker">
            <b>Fixtures</b>
            Planner
          </span>
          <h1 className="display">
            Find the <em>easy runs.</em>
          </h1>
          <p className="sub">
            Every club&apos;s next five gameweeks, coloured by FPL&apos;s difficulty and ranked by our adjusted run, which
            also weighs opponent strength and home advantage. Run scores are estimates.
          </p>
        </div>
        {targets.length > 0 && <TeamTargets targets={targets} />}
        {rows.length > 0 && <FixtureSwings rows={rows} />}
        {rows.length > 0 ? (
          <FixturePlanner gameweeks={gameweeks} rows={rows} />
        ) : (
          <div className="notice error">The fixtures aren&apos;t available right now. Try again in a few minutes.</div>
        )}
      </div>
    </section>
  );
}
