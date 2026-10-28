import type { Kit } from "@fpl/shared";

/**
 * Our own shirt drawing, coloured from the kit table (packages/shared/src/kits.ts).
 * Never an official kit image (CLAUDE.md §8).
 */
const BODY =
  "M30 6 L22 9 L10 15 L3 30 L14 35 L17 28 L17 72 Q17 76 21 76 L79 76 Q83 76 83 72 L83 28 L86 35 L97 30 L90 15 L78 9 L70 6 Q66 13 50 14 Q34 13 30 6 Z";
const LEFT_SLEEVE = "M22 9 L10 15 L3 30 L14 35 L17 28 L17 16 Z";
const RIGHT_SLEEVE = "M78 9 L90 15 L97 30 L86 35 L83 28 L83 16 Z";

export function Shirt({ kit, label, id }: { kit: Kit; label: string; id: string }) {
  const clip = `shirt-${id}`;
  return (
    <svg viewBox="0 0 100 80" role="img" aria-label={`${label} shirt`}>
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`${clip}-shade`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="80" fill={kit.primary} />
        {kit.pattern === "stripes" &&
          [24, 40, 56, 72].map((x) => <rect key={x} x={x} y="0" width="8" height="80" fill={kit.secondary} />)}
        {kit.pattern === "sleeves" && (
          <>
            <path d={LEFT_SLEEVE} fill={kit.secondary} />
            <path d={RIGHT_SLEEVE} fill={kit.secondary} />
          </>
        )}
        <rect width="100" height="80" fill={`url(#${clip}-shade)`} />
      </g>
      <path d={BODY} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
      <path d="M30 6 Q34 13 50 14 Q66 13 70 6" fill="none" stroke={kit.secondary} strokeWidth="2.4" />
      {kit.pattern === "stripes" && (
        // A chest panel, as on real striped shirts, so the label stays readable.
        <rect x="31" y="38" width="38" height="17" rx="3" fill={kit.primary} stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      )}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
        fontWeight="800"
        fontSize="15"
        letterSpacing="0.5"
        fill={kit.ink}
        opacity="0.92"
      >
        {label}
      </text>
    </svg>
  );
}
