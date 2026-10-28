import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Gameweek Copilot — your FPL squad, read by an agent", template: "%s · Gameweek Copilot" },
  description:
    "Enter your FPL team ID: see your squad on the pitch and ask an AI agent that answers only with numbers our pipeline computed — every tool call shown live.",
  openGraph: {
    title: "Gameweek Copilot",
    description: "Your FPL squad, read by an agent that shows its work.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Header />
        <div className="frame">
          <div className="rail" aria-hidden="true" />
          <main className="content">
            {children}
            <Footer />
          </main>
          <div className="rail" aria-hidden="true" />
        </div>
      </body>
    </html>
  );
}
