import type { Metadata } from "next";
import { CardPage } from "@/components/cards/CardPage";

export const metadata: Metadata = {
  alternates: { canonical: "/cards/template" }, title: "The template XI", description: "The most-owned XI in Fantasy Premier League right now, drawn on a pitch.",
  openGraph: { images: [{ url: "/cards/template/image.png", width: 1200, height: 630, alt: "The template XI: the most-owned FPL team, on a pitch, from Armband" }] },
  twitter: { card: "summary_large_image", images: ["/cards/template/image.png"] },
};
export const revalidate = 1800;

export default function Card() {
  return (
    <CardPage
      slug="template"
      title="The template XI"
      sub="The most-owned legal XI in FPL right now, with each player's ownership"
      text="The FPL template XI right now: the most-owned team, player by player"
      tool={{ href: "/stats", label: "ownership in the stats" }}
    />
  );
}
