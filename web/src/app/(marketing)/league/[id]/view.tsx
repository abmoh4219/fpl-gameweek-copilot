import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INSIGHT_CONFIG, chipName, kitImageUrl, type LeagueCount } from "@fpl/shared";
import { ShareBar } from "@/components/cards/ShareBar";
import { YouHint } from "@/components/league/YouHint";
import { parseTeamId, TeamNotFoundError } from "@/lib/fpl";
import { loadLeague } from "@/lib/league";
import "@/components/cards/cards.css";
import "@/components/charts/charts.css";
import "./league.css";

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

/*
 * The mini-league spy, shared by /league/[id] and /league/[id]/me/[me]. The
 * second is where next.config rewrites /league/<id>?me=<team>, so each league,
 * with or without "you", is its own cached page (ADR-0025).
 */

/** The league and "you" from route params; null when either is not an ID. */
export async function leagueIds(params: Promise<{ id: string; me?: string }>) {
  const p = await params;
  return { id: parseTeamId(p.id), me: p.me === undefined ? null : parseTeamId(p.me) };
}

export function leagueMetadata(id: number | null, me: number | null): Metadata {
  const image = `/league/${id}/image.png${me ? `?me=${me}` : ""}`;
  return {
    title: "Mini-league spy",
    description: "A mini-league's captains, chips and most-owned players this gameweek, from Armband.",
    robots: { index: false, follow: false },
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

function Bars({ title, items, empty }: { title: string; items: LeagueCount[]; empty: string }) {
  return (
    <section className="ins-card lg-bars">
      <h2 className="ins-title">{title}</h2>
      {items.length === 0 ? (
        <p className="chart-empty">{empty}</p>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.fplId}>
              <img src={kitImageUrl(c.teamCode, c.position === "GKP", 66)} alt="" width={22} height={29} referrerPolicy="no-referrer" loading="lazy" />
              <Link href={`/players/${c.fplId}`}>{c.name}</Link>
              <span className="lg-bar" style={{ ["--w" as string]: `${Math.max(3, c.share)}%` }} />
              <b>{c.share}%</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function LeagueView({ id, me }: { id: number | null; me: number | null }) {
  if (!id) notFound();
  let spy: Awaited<ReturnType<typeof loadLeague>> = null;
  try {
    spy = await loadLeague(id, me);
  } catch (error) {
    // FPL answers 404 for a league that doesn't exist; anything else is FPL being
    // busy. That is thrown, not rendered, so it is never cached: error.tsx shows
    // the message and a page that loaded before keeps being served meanwhile.
    if (error instanceof TeamNotFoundError) notFound();
    console.error(`league ${id} failed:`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (!spy) notFound();
  const cfg = INSIGHT_CONFIG.league;
  const shareQuery = me ? `?me=${me}` : "";

  return (
    <section className="block league-page">
      <div className="wrap">
        <Link href="/league" className="pp-back">
          ← Another league
        </Link>
        <header className="tool-head">
          <h1>{spy.name}</h1>
          <p>
            Gameweek {spy.gameweek} · captains, chips and ownership read from the top {spy.analysed} teams
          </p>
          {!me && <YouHint league={id} />}
        </header>

        <div className="lg-grid">
          <div className="ins-card lg-table-card">
            <table className="lg-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Team</th>
                  <th scope="col">GW</th>
                  <th scope="col">Total</th>
                  <th scope="col">Captain</th>
                </tr>
              </thead>
              <tbody>
                {spy.table.map((r) => (
                  <tr key={r.entry} className={r.entry === me ? "is-you" : undefined}>
                    <td className="lg-rank">
                      {r.rank}
                      {r.move !== 0 && <i className={r.move > 0 ? "up" : "down"}>{r.move > 0 ? "▲" : "▼"}</i>}
                    </td>
                    <td>
                      <Link href={`/team/${r.entry}`} prefetch={false}>
                        {r.team}
                      </Link>
                      <small>{r.manager}</small>
                    </td>
                    <td>{r.gameweek}</td>
                    <td>{r.total.toLocaleString("en-GB")}</td>
                    <td>
                      {r.captain ?? "—"}
                      {r.chip && <small>{chipName(r.chip)}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {spy.yourLine && !spy.table.some((r) => r.entry === me) && (
                <tfoot>
                  <tr className="is-you">
                    <td className="lg-rank">{spy.yourLine.rank.toLocaleString("en-GB")}</td>
                    <td>
                      You · {spy.yourLine.team}
                      <small>Your place in this league</small>
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="lg-side">
            {spy.you && (
              <>
                <Bars
                  title="Your differentials"
                  items={spy.you.differentials}
                  empty={`None of your players is owned by ${cfg.differentialMax}% or fewer of these rivals.`}
                />
                <Bars title="Most of them own, you don't" items={spy.you.threats} empty={`No player is owned by ${cfg.threatMin}% or more of them that you don't own.`} />
              </>
            )}
            <Bars title="Captains this gameweek" items={spy.captains} empty="Captains show once the gameweek's teams are locked." />
            <section className="ins-card lg-bars">
              <h2 className="ins-title">Chips this gameweek</h2>
              <p className="lg-chips">
                {spy.chips.length === 0
                  ? `None of the ${spy.analysed} teams read has played a chip.`
                  : spy.chips.map((c) => `${chipName(c.chip)} ×${c.count}`).join(" · ")}
              </p>
            </section>
            <Bars title="Most owned in this league" items={spy.owned} empty="Ownership isn't available right now." />
          </div>
        </div>

        <ShareBar
          image={`/league/${id}/image.png${shareQuery}`}
          page={`${SITE}/league/${id}${shareQuery}`}
          text={`${spy.name}: who our league is captaining in Gameweek ${spy.gameweek}`}
          file={`armband-league-${id}.png`}
        />
        <p className="card-more">
          Shares are out of the {spy.analysed} teams read from the top of the league (at most {cfg.rivals}), from FPL&apos;s public data.
        </p>
      </div>
    </section>
  );
}
