import type { Metadata } from "next";
import { CardPage } from "@/components/cards/CardPage";

export const metadata: Metadata = {
  title: "Tonight's price watch",
  description: "The FPL players closest to a price rise or fall tonight, as a card to share. An estimate.",
  openGraph: { images: [{ url: "/cards/prices/image.png", width: 1200, height: 630, alt: "Tonight's FPL price watch: the players closest to a rise or a fall, an estimate, from Armband" }] },
  twitter: { card: "summary_large_image", images: ["/cards/prices/image.png"] },
};
export const revalidate = 1800;

export default function Card() {
  return (
    <CardPage
      slug="prices"
      title="Tonight's price watch"
      sub="The players closest to a price rise or fall tonight, from FPL's own data. An estimate"
      text="Tonight's FPL price watch: who's closest to a rise or fall (estimate)"
      tool={{ href: "/prices", label: "the full price watch" }}
    />
  );
}
