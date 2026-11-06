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

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ me?: string }> };

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

async function read({ params, searchParams }: Props) {
  const id = parseTeamId((await params).id);
  const me = parseTeamId((await searchParams).me ?? "");
  return { id, me };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id, me } = await read(props);
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

export default async function League(props: Props) {
  const { id, me } = await read(props);
  if (!id) notFound();
  let spy: Awaited<ReturnType<typeof loadLeague>> = null;
  try {
    spy = await loadLeague(id, me);
  } catch (error) {
    // FPL answers 404 for a league that doesn't exist; anything else is FPL being busy.
    if (error instanceof TeamNotFoundError) notFound();
    console.error(`league ${id} failed:`, error instanceof Error ? error.message : error);
    return (
      <section className="block league-page">
        <div className="wrap">
          <header className="tool-head">
            <h1>Mini-league spy</h1>
            <p>FPL isn&apos;t answering right now (it pauses while a gameweek is being scored). Try again in a minute.</p>
          </header>
        </div>
      </section>
    );
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
                      <Link href={`/team/${r.entry}`}>{r.team}</Link>
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
            <Bars title="Captains this gameweek" items={spy.captains.slice(0, 6)} empty="Captains show once the gameweek's teams are locked." />
            <Bars title="Most owned in this league" items={spy.owned.slice(0, 6)} empty="Ownership isn't available right now." />
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
