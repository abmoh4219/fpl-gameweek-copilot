import type { Metadata } from "next";
import { CardPage } from "@/components/cards/CardPage";

export const metadata: Metadata = {
  alternates: { canonical: "/cards/swings" },
  title: "Fixture swings",
  description: "The FPL clubs whose fixtures turn easier or harder over the next five gameweeks, as a card to share.",
  openGraph: { images: [{ url: "/cards/swings/image.png", width: 1200, height: 630, alt: "Fixture swings: clubs whose FPL difficulty turns easier or harder, from Armband" }] },
  twitter: { card: "summary_large_image", images: ["/cards/swings/image.png"] },
};
export const revalidate = 1800;

export default function Card() {
  return (
    <CardPage
      slug="swings"
      title="Fixture swings"
      sub="Clubs whose next two gameweeks and the three after differ most in FPL's difficulty rating"
      text="FPL fixture swings: whose run turns easier or harder over the next five gameweeks"
      tool={{ href: "/fixtures", label: "the fixture planner" }}
    />
  );
}
