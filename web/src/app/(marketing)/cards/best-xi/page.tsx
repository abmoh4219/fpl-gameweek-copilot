import type { Metadata } from "next";
import { CardPage } from "@/components/cards/CardPage";

export const metadata: Metadata = {
  alternates: { canonical: "/cards/best-xi" },
  title: "The gameweek's best XI",
  description: "The highest-scoring legal XI of the latest FPL gameweek, on a pitch, as a card to share.",
  openGraph: { images: [{ url: "/cards/best-xi/image.png", width: 1200, height: 630, alt: "The latest FPL gameweek's best XI on a pitch, from Armband" }] },
  twitter: { card: "summary_large_image", images: ["/cards/best-xi/image.png"] },
};
export const revalidate = 1800;

export default function Card() {
  return (
    <CardPage
      slug="best-xi"
      title="The gameweek's best XI"
      sub="The highest-scoring legal XI of the latest gameweek, with each player's points and ownership"
      text="The best XI of the FPL gameweek, and how many managers owned them"
      tool={{ href: "/stats", label: "the stats leaderboards" }}
    />
  );
}
