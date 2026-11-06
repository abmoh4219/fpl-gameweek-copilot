import Link from "next/link";
import { ShareBar } from "./ShareBar";
import "./cards.css";

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

/** A card's own page: the card, the ways to share it, and the tool behind it. */
export function CardPage({
  slug,
  title,
  sub,
  text,
  tool,
}: {
  slug: string;
  title: string;
  sub: string;
  /** The words that go with the card when it is posted. */
  text: string;
  tool: { href: string; label: string };
}) {
  const image = `/cards/${slug}/image.png`;
  return (
    <section className="block card-page">
      <div className="wrap">
        <Link href="/cards" className="pp-back">
          ← All cards
        </Link>
        <header className="tool-head">
          <h1>{title}</h1>
          <p>{sub}</p>
        </header>
        <figure className="card-shot">
          <img src={image} alt={`${title}, as a shareable card`} width={1200} height={630} />
        </figure>
        <ShareBar image={image} page={`${SITE}/cards/${slug}`} text={text} file={`armband-${slug}.png`} />
        <p className="card-more">
          The numbers behind it: <Link href={tool.href}>{tool.label}</Link>
        </p>
      </div>
    </section>
  );
}
