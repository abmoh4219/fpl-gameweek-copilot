import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Display type: condensed and sporty, like a scoreboard or a kit number.
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
  display: "swap",
});

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Armband — the FPL co-pilot that does the homework", template: "%s · Armband" },
  description:
    "Connect your Fantasy Premier League team. See your squad, then ask a co-pilot about captaincy, transfers and fixtures — every answer backed by numbers you can check.",
  openGraph: {
    title: "Armband",
    description: "Your FPL team, with a co-pilot that does the homework.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#070a14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
