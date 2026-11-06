import type { Metadata } from "next";
import Link from "next/link";
import "@/components/cards/cards.css";

export const metadata: Metadata = {
  title: "Cards",
  description: "Shareable FPL cards from Armband: the transfer radar, the template XI and tonight's price watch, updated with every data refresh.",
};

const CARDS = [
  { slug: "transfers", title: "The transfer radar", sub: "Who managers are buying and selling this gameweek" },
  { slug: "template", title: "The template XI", sub: "The most-owned team, on a pitch" },
  { slug: "prices", title: "Tonight's price watch", sub: "Closest to a rise or fall tonight, an estimate" },
  { slug: "best-xi", title: "The gameweek's best XI", sub: "The highest-scoring XI of the latest gameweek" },
  { slug: "swings", title: "Fixture swings", sub: "Whose run turns easier or harder" },
] as const;

export default function Cards() {
  return (
    <section className="block card-page">
      <div className="wrap">
        <header className="tool-head">
          <h1>Cards</h1>
          <p>FPL&apos;s week in pictures, made to share. Every card updates with our data and carries its source</p>
        </header>
        <div className="card-grid">
          {CARDS.map((c) => (
            <Link key={c.slug} href={`/cards/${c.slug}`} className="card-tile">
              <img src={`/cards/${c.slug}/image.png`} alt="" width={1200} height={630} loading="lazy" />
              <b>{c.title}</b>
              <span>{c.sub}</span>
            </Link>
          ))}
        </div>
        <h2 className="tool-h2">Your own cards</h2>
        <div className="card-grid">
          <Link href="/team" className="card-tile">
            <b>Your gameweek, wrapped</b>
            <span>Your points against the average, your captain, the bench and your rank. Open your team, then share it</span>
          </Link>
          <Link href="/league" className="card-tile">
            <b>Your mini-league</b>
            <span>The table, this gameweek&apos;s captains and your differentials against your rivals</span>
          </Link>
          <Link href="/compare" className="card-tile">
            <b>Compare players</b>
            <span>Two or three players on one radar, with their next five fixtures</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
