import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The share card for links to Armband (X, Telegram, WhatsApp…). Our own artwork only. */
export const alt = "Armband — free FPL stats, fixtures and price watch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  // Barlow Condensed (SIL Open Font License), shipped with the app so the card
  // is built without a network call.
  const display = await readFile(join(process.cwd(), "src/app/fonts/BarlowCondensed-ExtraBoldItalic.ttf"));
  const big = { fontFamily: "Barlow", fontSize: 132, lineHeight: 0.92, textTransform: "uppercase" as const };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          // The Stadium theme (app/globals.css): pitch-green night, chalk text, volt accent.
          background: "radial-gradient(ellipse at 50% -10%, #12301f 0%, #04100a 62%)",
          color: "#f2f6ec",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="112" height="100" viewBox="0 0 36 32">
            <path d="M7 6 H34.5 L29.5 26 H2 Z" fill="#d6ff3a" stroke="#d6ff3a" strokeWidth="2" strokeLinejoin="round" />
            <path d="M5.8 10.2 H33 M3.6 21.8 H30.6" stroke="#0b1500" strokeWidth="1.3" opacity="0.4" />
            <path d="M21.6 12.4 A5 5 0 1 0 21.6 19.6" fill="none" stroke="#0b1500" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
          <div style={{ fontFamily: "Barlow", fontSize: 76, letterSpacing: 1 }}>ARMBAND</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={big}>Your FPL team.</div>
          <div style={{ ...big, color: "#d6ff3a" }}>Deadline-ready.</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#a9bbae" }}>
          Free FPL stats, fixtures and price watch · every number shown
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Barlow", data: display, style: "italic", weight: 800 }] },
  );
}
