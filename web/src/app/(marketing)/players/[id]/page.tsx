import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  STAT_COLUMNS,
  gameweekSeries,
  kitImageUrl,
  minutesShare,
  pointsBreakdown,
  priceHistory,
  statRowFromView,
  type GameweekViewRow,
  type SiteCard,
  type StatViewRow,
} from "@fpl/shared";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { PriceLine } from "@/components/charts/PriceLine";
import { RingMeter } from "@/components/charts/RingMeter";
import { SegmentedBar } from "@/components/charts/SegmentedBar";
import { readView } from "@/lib/supabase";
import "@/components/charts/charts.css";
import "./player.css";
import { How } from "@/components/charts/How";

export const revalidate = 3600;

type Params = { params: Promise<{ id: string }> };

async function player(fplId: number) {
  const [current, cards, gameweeks, changes] = await Promise.all([
    readView<StatViewRow & { news: string; chance_of_playing_next_round: number | null; cost_change_start: number }>(
      "player_current",
      `select=${STAT_COLUMNS.join(",")},news,chance_of_playing_next_round,cost_change_start&fpl_id=eq.${fplId}`,
      3600,
    ).catch(() => []),
    readView<{ card: SiteCard }>("player_cards", `select=card&fpl_id=eq.${fplId}`, 3600).catch(() => []),
    readView<GameweekViewRow>("player_gameweeks", `select=*&fpl_id=eq.${fplId}&order=gameweek`, 3600).catch(() => []),
    readView<{ changed_on: string; change_m: number }>("price_changes_daily", `select=changed_on,change_m&fpl_id=eq.${fplId}`, 3600).catch(() => []),
  ]);
  const raw = current[0];
  const row = raw ? statRowFromView(raw) : null;
  if (!raw || !row) return null;
  return { raw, row, card: cards[0]?.card ?? null, gameweeks, changes };
}

function idOf(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = idOf((await params).id);
  const p = id ? await player(id) : null;
  if (!p) return { title: "Player not found" };
  return {
    title: `${p.row.webName} FPL stats: points, xG, price and fixtures`,
    alternates: { canonical: `/players/${id}` },
    description: `${p.row.webName} (${p.row.team}, ${p.row.position}, £${p.row.priceM.toFixed(1)}m): ${p.row.totalPoints} FPL points, ${p.row.goals} goals, ${p.row.assists} assists. Points per gameweek, how the points were scored, price history and the next five fixtures.`,
  };
}

const POSITION_NAME = { GKP: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" } as const;

export default async function PlayerPage({ params }: Params) {
  const id = idOf((await params).id);
  const p = id ? await player(id) : null;
  if (!p) notFound();
  const { raw, row, card, gameweeks, changes } = p;

  const series = gameweekSeries(gameweeks);
  const breakdown = pointsBreakdown(gameweeks);
  const today = new Date().toISOString().slice(0, 10);
  const prices = priceHistory(row.priceM, changes, today);
  const latestGw = series.at(-1)?.gameweek ?? 0;
  const share = minutesShare(row.minutes, latestGw);
  const chance = raw.chance_of_playing_next_round;
  const startChange = Number(raw.cost_change_start ?? 0) / 10;
  const fixtures = card?.fixturesLong.fixtures ?? [];
  const status = row.status === "a" ? null : row.status === "d" ? "Doubtful" : row.status === "s" ? "Suspended" : row.status === "u" ? "Unavailable" : "Injured";

  return (
    <section className="block player-page">
      <div className="wrap">
        <Link href="/stats" className="pp-back">
          ← All stats
        </Link>

        <header className="pp-head">
          <img className="pp-kit" src={kitImageUrl(row.teamCode, row.position === "GKP", 220)} alt="" referrerPolicy="no-referrer" width={110} height={146} />
          <div className="pp-id">
            <span className="pp-kicker">
              {row.team} · {POSITION_NAME[row.position]}
            </span>
            <h1 className="display pp-name">{row.webName}</h1>
            <div className="pp-meta">
              <span className="pp-price">£{row.priceM.toFixed(1)}m</span>
              {startChange !== 0 && (
                <span className={startChange > 0 ? "up" : "down"}>
                  {startChange > 0 ? "▲" : "▼"} £{Math.abs(startChange).toFixed(1)}m this season
                </span>
              )}
              {status && <span className={`pp-status ${row.status === "d" ? "doubt" : "out"}`}>{status}</span>}
            </div>
            {raw.news && <p className="pp-news">{raw.news}</p>}
            <p className="tool-share">
              <Link href={`/compare?p=${row.fplId}`}>Compare {row.webName} with another player</Link>
            </p>
          </div>
        </header>

        <div className="pp-kpis">
          {[
            ["Season points", String(row.totalPoints)],
            ["Form", row.form.toFixed(1)],
            ["Goals · assists", `${row.goals} · ${row.assists}`],
            ["xGI per 90", row.minutes >= 270 ? row.xgi90.toFixed(2) : "—"],
            ["Points per £m", (row.totalPoints / Math.max(row.priceM, 0.1)).toFixed(1)],
          ].map(([label, value]) => (
            <div className="pp-kpi" key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>

        <div className="pp-rings">
          <RingMeter value={row.ownership / 100} label="Owned by" display={`${row.ownership.toFixed(1)}%`} note="of FPL managers" />
          <RingMeter
            value={share}
            label="Minutes played"
            display={`${Math.round(share * 100)}%`}
            note={`${row.minutes.toLocaleString("en-GB")} of ${(latestGw * 90).toLocaleString("en-GB")} possible`}
            tone="lo"
          />
          {/* FPL leaves the chance empty when there is no flag: that means "no injury news", not "certain to play". */}
          <RingMeter
            value={chance === null ? 1 : chance / 100}
            label="Chance of playing"
            display={chance === null ? "Fit" : `${chance}%`}
            note={chance === null ? "No injury flag from FPL" : "Next gameweek, from FPL"}
            tone={chance === null || chance >= 75 ? "lo" : chance >= 50 ? "warn" : "danger"}
          />
        </div>

        <div className="pp-grid">
          {row.minutes > 0 ? (
            <>
              <div className="ins-card pp-wide">
                <h2 className="ins-title">Points per gameweek</h2>
                <How>FPL points in each gameweek this season. Hover a column for minutes, goals and assists.</How>
                <ColumnChart
                  columns={series.map((g) => ({
                    key: String(g.gameweek),
                    label: `GW${g.gameweek}`,
                    value: g.points,
                    detail: [`${g.minutes} minutes`, `${g.goals} goals · ${g.assists} assists`, `${g.xgi.toFixed(2)} xGI`],
                  }))}
                  format="int"
                  summary={`${row.webName}'s points per gameweek: ${series.map((g) => `GW${g.gameweek} ${g.points}`).join(", ")}.`}
                />
              </div>

              <div className="ins-card">
                <h2 className="ins-title">Expected goal involvements</h2>
                <How>xG plus xA per gameweek: the quality of chances, whether or not they went in.</How>
                <ColumnChart
                  columns={series.map((g) => ({ key: String(g.gameweek), label: `GW${g.gameweek}`, value: Math.round(g.xgi * 100) / 100, detail: [`${g.minutes} minutes`] }))}
                  format="dec2"
                  summary={`${row.webName}'s xGI per gameweek.`}
                  height={180}
                  tone="lo"
                />
              </div>
            </>
          ) : (
            <div className="ins-card pp-wide">
              <h2 className="ins-title">Season so far</h2>
              <p className="chart-empty">{row.webName} hasn&apos;t played a minute yet this season.</p>
            </div>
          )}

          {/* On its own (a player with no minutes) the price card takes the full row. */}
          <div className={`ins-card${row.minutes > 0 ? "" : " pp-wide"}`}>
            <h2 className="ins-title">Price this season</h2>
            <How>Every confirmed price change since we started tracking.</How>
            <PriceLine points={prices} summary={`${row.webName}'s price: ${prices.map((x) => `£${x.priceM.toFixed(1)}m on ${x.date}`).join(", ")}.`} />
          </div>

          <div className="ins-card pp-wide">
            <h2 className="ins-title">Where the points came from</h2>
            <How>FPL&apos;s own breakdown of every point this season, by stat.</How>
            {breakdown.parts.length > 0 ? (
              <>
                <SegmentedBar
                  parts={breakdown.parts}
                  total={breakdown.total}
                  summary={`${row.webName}'s points by source: ${breakdown.parts.map((x) => `${x.label} ${x.points}`).join(", ")}.`}
                />
                {breakdown.deductions.length > 0 && (
                  <p className="pp-deductions">
                    Deductions:{" "}
                    {breakdown.deductions.map((d) => (
                      <span key={d.id}>
                        {d.label} <b>{d.points}</b>
                      </span>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <p className="chart-empty">No points yet this season.</p>
            )}
          </div>

          {fixtures.length > 0 && (
            <div className="ins-card pp-wide">
              <h2 className="ins-title">Next five gameweeks</h2>
              <How>
                FPL difficulty for {row.team}. Run: <b>{card?.fixturesLong.band}</b> (estimate).
              </How>
              <div className="pp-fixtures">
                {fixtures.map((f) => (
                  <div key={f.gameweek} className={`pp-fx d${f.isBlank ? "x" : (f.difficulty ?? 3)}`}>
                    <small>GW{f.gameweek}</small>
                    <b>{f.isBlank ? "Blank" : f.opponent}</b>
                    <span>{f.isBlank ? "" : f.isHome ? "Home" : "Away"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
