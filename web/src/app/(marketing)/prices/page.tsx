import type { Metadata } from "next";
import Link from "next/link";
import { PRICE_WATCH_COLUMNS, changeDays, kitImageUrl, watchRowFromView, type ChangeViewRow, type PriceWatchViewRow } from "@fpl/shared";
import { PressureBoard } from "@/components/prices/PressureBoard";
import { PriceWatch } from "@/components/prices/PriceWatch";
import { readView } from "@/lib/supabase";
import "@/components/charts/charts.css";
import "./prices.css";

export const metadata: Metadata = {
  title: "FPL price watch",
  description: "Which Fantasy Premier League players are closest to a price rise or fall tonight, from FPL's own price-change data, plus every confirmed change this week.",
};

// Price data moves through the day; refresh the page every 30 minutes.
export const revalidate = 1800;

async function priceData() {
  const since = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const [watch, changes, teams] = await Promise.all([
    readView<PriceWatchViewRow>("price_watch", `select=${PRICE_WATCH_COLUMNS.join(",")}&direction=neq.stable`, 1800).catch(() => []),
    readView<ChangeViewRow>(
      "price_changes_daily",
      `select=fpl_id,web_name,element_type,team_short_name,changed_on,change_m,price_m,direction&changed_on=gte.${since}`,
      1800,
    ).catch(() => []),
    readView<{ team_short_name: string; team_code: number }>("team_runs", "select=team_short_name,team_code", 3600).catch(() => []),
  ]);
  const codes = Object.fromEntries(teams.map((t) => [t.team_short_name, t.team_code]));
  return {
    rows: watch.flatMap((r) => watchRowFromView(r) ?? []),
    days: changeDays(changes, 7),
    codes,
  };
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export default async function PricesPage() {
  const { rows, days, codes } = await priceData();
  const kit = (team: string, elementType: number) => {
    const code = codes[team];
    return code ? <img src={kitImageUrl(code, elementType === 1, 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={22} height={29} /> : <span />;
  };

  return (
    <section className="block prices-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Prices</h1>
          <p>Who is closest to a rise or fall tonight, from FPL&apos;s own data (an estimate), and every confirmed change</p>
          <p className="tool-share">
            <Link href="/cards/prices">Share tonight's price watch as a card</Link>
          </p>
        </header>

        {rows.length > 0 && <PressureBoard rows={rows} />}
        {rows.length > 0 ? (
          <PriceWatch rows={rows} codes={codes} />
        ) : (
          <div className="notice error">The price watch isn&apos;t available right now. Try again in a few minutes.</div>
        )}

        <div className="pw-history">
          <h2 className="pw-h2">Confirmed changes</h2>
          {days.length === 0 && <p className="pw-empty">No price changes in the last week.</p>}
          {days.map((d) => (
            <div className="pw-day" key={d.date}>
              <h3>{dayLabel(d.date)}</h3>
              <div className="pw-day-cols">
                {(
                  [
                    ["Risers", d.rises, "up"],
                    ["Fallers", d.falls, "down"],
                  ] as const
                ).map(([label, list, tone]) => (
                  <div className="pw-col" key={label}>
                    <span className="pw-col-head">
                      {label} <small>{list.length}</small>
                    </span>
                    {list.length === 0 && <p className="pw-empty">None.</p>}
                    {list.slice(0, 12).map((c) => (
                      <div className="pw-change" key={`${c.fpl_id}-${c.changed_on}`}>
                        {kit(c.team_short_name, c.element_type)}
                        <Link href={`/players/${c.fpl_id}`} className="pw-name pw-link">
                          {c.web_name} <small>{c.team_short_name}</small>
                        </Link>
                        <span className={`pw-delta ${tone}`}>
                          {tone === "up" ? "▲" : "▼"} £{Math.abs(c.change_m).toFixed(1)}m
                        </span>
                        <span className="pw-now">£{c.price_m.toFixed(1)}m</span>
                      </div>
                    ))}
                    {list.length > 12 && <p className="pw-more">and {list.length - 12} more</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
