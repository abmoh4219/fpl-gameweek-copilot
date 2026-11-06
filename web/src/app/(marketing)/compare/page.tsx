import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_AXES, comparePlayers } from "@fpl/shared";
import { ShareBar } from "@/components/cards/ShareBar";
import { How } from "@/components/charts/How";
import { RadarChart, SERIES } from "@/components/charts/RadarChart";
import { ComparePicker } from "@/components/compare/ComparePicker";
import { allCards } from "@/lib/cards";
import { statRows } from "@/lib/cards/data";
import "@/components/charts/charts.css";
import "@/components/cards/cards.css";
import "./compare.css";

type Search = { searchParams: Promise<{ p?: string }> };

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

function ids(p: string | undefined): number[] {
  return [...new Set((p ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100_000))].slice(0, 3);
}

export async function generateMetadata({ searchParams }: Search): Promise<Metadata> {
  const chosen = ids((await searchParams).p);
  const image = chosen.length ? `/compare/image.png?p=${chosen.join(",")}` : null;
  return {
    title: "Compare FPL players",
    alternates: { canonical: "/compare" },
    description: "Compare up to three FPL players side by side: points, form, xGI per 90, goals and assists, minutes and value, with their next five fixtures.",
    ...(image ? { openGraph: { images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", images: [image] } } : {}),
  };
}

const FDR = (d: number | null) => (d === null ? "dx" : `d${d}`);

export default async function Compare({ searchParams }: Search) {
  const chosen = ids((await searchParams).p);
  const [{ rows }, cards] = await Promise.all([statRows(), allCards()]);
  const lines = comparePlayers(rows, chosen);
  const options = rows
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((r) => ({ id: r.fplId, name: r.webName, team: r.team, position: r.position }));
  const names = lines.map((l) => l.row.webName);

  return (
    <section className="block compare-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Compare</h1>
          <p>Up to three players side by side, ranked against every outfield player with real minutes</p>
        </header>
        <ComparePicker options={options} selected={lines.map((l) => l.row.fplId)} />

        {lines.length === 0 ? (
          <p className="cmp-empty">Search a player above to start. Add a second and a third to see them side by side.</p>
        ) : (
          <>
            <div className="cmp-grid">
              <div className="ins-card">
                <RadarChart
                  axes={COMPARE_AXES.map((a) => a.label)}
                  lines={lines.map((l) => ({ name: l.row.webName, values: l.percentiles }))}
                  summary={lines.map((l) => `${l.row.webName}: ${COMPARE_AXES.map((a, i) => `${a.label} ${l.raw[i]}`).join(", ")}`).join(". ")}
                />
                <How>
                  Each spoke is a percentile among every outfield player with at least 270 minutes this season: the edge
                  of the chart is the best in the game, the centre the lowest. The real numbers are in the table.
                </How>
              </div>
              <div className="ins-card cmp-table-card">
                <table className="cmp-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="sr-only">Stat</span>
                      </th>
                      {lines.map((l, i) => (
                        <th scope="col" key={l.row.fplId} style={{ ["--c" as string]: SERIES[i] }}>
                          <i aria-hidden="true" />
                          <Link href={`/players/${l.row.fplId}`}>{l.row.webName}</Link>
                          <small>
                            {l.row.team} · £{l.row.priceM.toFixed(1)}m
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_AXES.map((a, k) => {
                      const best = Math.max(...lines.map((l) => l.percentiles[k]!));
                      return (
                        <tr key={a.id}>
                          <th scope="row">{a.label}</th>
                          {lines.map((l) => (
                            <td key={l.row.fplId} className={lines.length > 1 && l.percentiles[k] === best ? "is-best" : undefined}>
                              {l.raw[k]}
                              <small>{l.percentiles[k]}th pct</small>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr>
                      <th scope="row">Owned</th>
                      {lines.map((l) => (
                        <td key={l.row.fplId}>{l.row.ownership.toFixed(1)}%</td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Next five</th>
                      {lines.map((l) => (
                        <td key={l.row.fplId}>
                          <span className="cmp-fdr">
                            {(cards.get(l.row.fplId)?.card.fixturesLong.fixtures ?? []).map((f) => (
                              <i key={f.gameweek} className={FDR(f.isBlank ? null : f.difficulty)} title={`GW${f.gameweek} ${f.isBlank ? "blank" : `${f.opponent} (${f.isHome ? "H" : "A"})`}`}>
                                {f.isBlank ? "–" : f.isHome ? f.opponent : f.opponent?.toLowerCase()}
                              </i>
                            ))}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <ShareBar
              image={`/compare/image.png?p=${chosen.join(",")}`}
              page={`${SITE}/compare?p=${chosen.join(",")}`}
              text={`${names.join(" vs ")}: compared on Armband`}
              file={`armband-compare-${names.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "")}.png`}
            />
          </>
        )}
      </div>
    </section>
  );
}
