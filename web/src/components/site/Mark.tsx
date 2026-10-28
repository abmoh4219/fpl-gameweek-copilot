/**
 * Our mark: a captain's armband — a slanted flare band with a "C". The
 * captaincy call is the decision FPL managers sweat most; that is the job.
 * Our own artwork; no league or FPL logo.
 */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={Math.round(size * 1.12)} height={size} viewBox="0 0 36 32" aria-hidden="true" className="mark-svg">
      <path d="M7 6 H34.5 L29.5 26 H2 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5.8 10.2 H33 M3.6 21.8 H30.6" stroke="var(--accent-ink)" strokeWidth="1.3" opacity="0.4" />
      <path d="M21.6 12.4 A5 5 0 1 0 21.6 19.6" fill="none" stroke="var(--accent-ink)" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

/** The wordmark: condensed and italic, like a name on a shirt. */
export function Wordmark() {
  return <span className="wordmark">Armband</span>;
}
