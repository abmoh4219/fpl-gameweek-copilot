import type { Metadata } from "next";
import { ABOUT } from "@/lib/site-copy";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "About",
  description: "Who builds Armband, the free open-source FPL stats hub, and how its numbers are made.",
};

export default function About() {
  return (
    <article className="legal wrap">
      <h1>{ABOUT.title}</h1>
      <p className="legal-lede">{ABOUT.intro}</p>
      {ABOUT.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      <ul>
        {ABOUT.links.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
