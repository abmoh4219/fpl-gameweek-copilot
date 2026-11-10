import type { Metadata } from "next";
import { CONTACT } from "@/lib/site-copy";

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: "Contact",
  description: "How to reach Armband: Telegram, GitHub issues and the contributing guide.",
};

export default function Contact() {
  return (
    <article className="legal wrap">
      <h1>{CONTACT.title}</h1>
      <p className="legal-lede">{CONTACT.intro}</p>
      {CONTACT.ways.map((w) => (
        <section key={w.heading}>
          <h2>{w.heading}</h2>
          <p>{w.body}</p>
          <p>
            <a href={w.href} target="_blank" rel="noreferrer">
              {w.label}
            </a>
          </p>
        </section>
      ))}
      <p>
        <b>{CONTACT.note}</b>
      </p>
    </article>
  );
}
