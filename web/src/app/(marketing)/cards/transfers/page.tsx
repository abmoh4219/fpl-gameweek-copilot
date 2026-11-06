import type { Metadata } from "next";
import { CardPage } from "@/components/cards/CardPage";

export const metadata: Metadata = {
  alternates: { canonical: "/cards/transfers" }, title: "The transfer radar", description: "This gameweek's biggest net transfers in and out in Fantasy Premier League, as a card to share.",
  openGraph: { images: [{ url: "/cards/transfers/image.png", width: 1200, height: 630, alt: "The transfer radar: this gameweek's biggest net transfers in and out, from Armband" }] },
  twitter: { card: "summary_large_image", images: ["/cards/transfers/image.png"] },
};
export const revalidate = 1800;

export default function Card() {
  return (
    <CardPage
      slug="transfers"
      title="The transfer radar"
      sub="This gameweek's biggest net transfers in and out, from FPL's own counts"
      text="This gameweek's FPL transfer radar: who managers are buying and selling"
      tool={{ href: "/stats", label: "the stats leaderboards" }}
    />
  );
}
