/**
 * Our mark: a slanted flare plate with a pass curling onto target — the
 * co-pilot's job in one line. Our own artwork; no league or FPL logo.
 */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={Math.round(size * 1.12)} height={size} viewBox="0 0 36 32" aria-hidden="true" className="mark-svg">
      <path d="M9 2.5 H33.5 L27 29.5 H2.5 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.5 22.5 Q13.5 9.5 25 10" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M21.6 6.6 L25.6 10 L21.9 13.6" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="22.8" r="2.7" fill="var(--accent-ink)" />
    </svg>
  );
}

/** The wordmark: condensed, italic, "Copilot" in flare. */
export function Wordmark() {
  return (
    <span className="wordmark">
      Gameweek<b>Copilot</b>
    </span>
  );
}
