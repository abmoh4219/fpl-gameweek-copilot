import Link from "next/link";
import { ShareBar } from "./ShareBar";
import "./cards.css";

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

/** A card's own page: the card, the ways to share it, and the tool behind it. */
export function CardPage({
  slug,
  path,
  title,
  sub,
  text,
  tool,
  back = { href: "/cards", label: "All cards" },
}: {
  /** A public card at /cards/<slug>. */
  slug?: string;
  /** Or any page path; its image is <path>/image.png. */
  path?: string;
  title: string;
  sub: string;
  /** The words that go with the card when it is posted. */
  text: string;
  tool: { href: string; label: string };
  back?: { href: string; label: string };
}) {
  const page = path ?? `/cards/${slug}`;
  const image = `${page}/image.png`;
  const file = `armband-${page.replace(/^\//, "").replace(/\//g, "-")}.png`;
  return (
    <section className="block card-page">
      <div className="wrap">
        <Link href={back.href} className="pp-back">
          ← {back.label}
        </Link>
        <header className="tool-head">
          <h1>{title}</h1>
          <p>{sub}</p>
        </header>
        <figure className="card-shot">
          <img src={image} alt={`${title}, as a shareable card`} width={1200} height={630} />
        </figure>
        <ShareBar image={image} page={`${SITE}${page}`} text={text} file={file} />
        <p className="card-more">
          The numbers behind it: <Link href={tool.href}>{tool.label}</Link>
        </p>
      </div>
    </section>
  );
}
