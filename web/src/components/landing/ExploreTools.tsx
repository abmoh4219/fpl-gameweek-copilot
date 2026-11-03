import Link from "next/link";

/**
 * The landing page's door to the free tools: four cards, each with one live
 * number from the pipeline, so a visitor sees the tool working before they
 * click. A card whose number is missing still links, without the number.
 */
export interface ExploreFacts {
  topScorer: { name: string; team: string; goals: number } | null;
  riser: { name: string; team: string; percent: number } | null;
  easiest: { team: string; band: string } | null;
  players: number;
}

const Arrow = () => (
  <span className="arrow" aria-hidden="true">
    →
  </span>
);

export function ExploreTools({ facts }: { facts: ExploreFacts }) {
  const cards = [
    {
      href: "/stats",
      title: "Stats",
      body: "Leaderboards and charts: finishing against xG, value, differentials.",
      kicker: "Top scorer",
      value: facts.topScorer ? `${facts.topScorer.name} · ${facts.topScorer.goals}` : null,
      note: facts.topScorer ? `${facts.topScorer.team} · goals this season` : null,
    },
    {
      href: "/prices",
      title: "Price watch",
      body: "Who is closest to a rise or fall tonight, and every change confirmed.",
      kicker: "Closest to a rise",
      value: facts.riser ? `${facts.riser.name} · ${Math.round(facts.riser.percent)}%` : null,
      note: facts.riser ? `${facts.riser.team} · estimate` : null,
    },
    {
      href: "/fixtures",
      title: "Fixture planner",
      body: "Every club's next five gameweeks, the easiest runs, and whose run is about to turn.",
      kicker: "Easiest next five",
      value: facts.easiest ? facts.easiest.team : null,
      note: facts.easiest ? `${facts.easiest.band} run · estimate` : null,
    },
    {
      href: "/players",
      title: "Players",
      body: "Search anyone: points per gameweek, where the points came from, price history.",
      kicker: "In the game",
      value: facts.players > 0 ? `${facts.players} players` : null,
      note: facts.players > 0 ? "every one with a page" : null,
    },
  ];

  return (
    <div className="explore">
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="explore-card reveal">
          {c.value && (
            <span className="explore-live">
              <small>{c.kicker}</small>
              <b>{c.value}</b>
              <em>{c.note}</em>
            </span>
          )}
          <span className="explore-text">
            <h3>
              {c.title} <Arrow />
            </h3>
            <p>{c.body}</p>
          </span>
        </Link>
      ))}
    </div>
  );
}
