import type { Metadata } from "next";
import { STAT_COLUMNS, statRowFromView, type StatViewRow } from "@fpl/shared";
import { PlayerSearch } from "@/components/players/PlayerSearch";
import { readView } from "@/lib/supabase";
import "./players.css";

export const metadata: Metadata = {
  alternates: { canonical: "/players" },
  title: "Find a player",
  description: "Search every Fantasy Premier League player: points, form, price and ownership, with a page for each player.",
};

export const revalidate = 3600;

export default async function PlayersPage() {
  const raw = await readView<StatViewRow>("player_current", `select=${STAT_COLUMNS.join(",")}`, 3600).catch(() => []);
  const rows = raw.flatMap((r) => statRowFromView(r) ?? []);
  return (
    <section className="block players-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Players</h1>
          <p>Search any player and open their full season</p>
        </header>
        {rows.length > 0 ? <PlayerSearch rows={rows} /> : <div className="notice error">Players aren&apos;t available right now. Try again in a few minutes.</div>}
      </div>
    </section>
  );
}
