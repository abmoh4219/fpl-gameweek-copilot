/**
 * A ring gauge for ONE ratio against its limit (ownership, minutes played,
 * chance of playing). A meter, not a pie: one value, its track a lighter step
 * of the same colour, the number printed in the middle so the ring is never
 * read alone.
 */
export function RingMeter({ value, label, display, note, tone = "hi" }: { value: number; label: string; display: string; note?: string; tone?: "hi" | "lo" | "warn" | "danger" }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <figure className={`ring ring-${tone}`}>
      <svg viewBox="0 0 80 80" width="80" height="80" role="img" aria-label={`${label}: ${display}`}>
        <circle cx="40" cy="40" r={r} className="ring-track" />
        {/* At 0 a round line cap would still paint a dot, so nothing is drawn. */}
        {v > 0 && (
          <circle cx="40" cy="40" r={r} className="ring-fill" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 40 40)" />
        )}
        <text x="40" y="45" textAnchor="middle" className="ring-value">
          {display}
        </text>
      </svg>
      <figcaption>
        <b>{label}</b>
        {note && <small>{note}</small>}
      </figcaption>
    </figure>
  );
}
