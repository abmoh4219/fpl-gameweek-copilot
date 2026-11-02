import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
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

// Headlines: an editorial grotesk with character, in sentence case.
const heading = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Armband — the Gaffer does your FPL homework", template: "%s · Armband" },
  description:
    "Connect your Fantasy Premier League team. See your squad, then ask the Gaffer — Armband's AI manager — to pick your XI, make transfers and choose a captain, with the numbers behind every call.",
  openGraph: {
    title: "Armband",
    description: "Your FPL team, managed by the Gaffer.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#04100a" },
    { media: "(prefers-color-scheme: light)", color: "#f4f1e9" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint: the saved choice, else the system setting. No flash of the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} ${heading.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
