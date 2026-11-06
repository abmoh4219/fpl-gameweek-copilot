import { ImageResponse } from "next/og";

/** The share card for links to Armband (X, Telegram, WhatsApp…). Our own artwork only. */
export const alt = "Armband — free FPL stats, fixtures and price watch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site's dark theme (app/globals.css): graphite, one volt accent, FPL's
// fixture difficulty colours as the signature. Geist is next/og's default font.
const DIFFICULTY = [
  ["#257d5a", "#ffffff"],
  ["#00e07a", "#062b17"],
  ["#3a3a3f", "#ededed"],
  ["#ff1751", "#ffffff"],
  ["#80072d", "#ffffff"],
] as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0e0e10",
          color: "#ededed",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="64" viewBox="0 0 36 32">
            <path d="M7 6 H34.5 L29.5 26 H2 Z" fill="#d6ff3a" stroke="#d6ff3a" strokeWidth="2" strokeLinejoin="round" />
            <path d="M5.8 10.2 H33 M3.6 21.8 H30.6" stroke="#0b1500" strokeWidth="1.3" opacity="0.4" />
            <path d="M21.6 12.4 A5 5 0 1 0 21.6 19.6" fill="none" stroke="#0b1500" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 52, letterSpacing: -1 }}>Armband</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 96, lineHeight: 1.04, letterSpacing: -3 }}>Your FPL team,</div>
          <div style={{ fontSize: 96, lineHeight: 1.04, letterSpacing: -3, color: "#d6ff3a" }}>deadline-ready</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#a1a1a6" }}>Free FPL stats, fixtures and price watch</div>
          <div style={{ display: "flex", gap: 8 }}>
            {DIFFICULTY.map(([bg, ink], i) => (
              <div
                key={bg}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 8, background: bg, color: ink, fontSize: 24 }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
