/** Our own mark: a pitch outline with a centre circle. No league or club artwork (CLAUDE.md §8). */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#0c0c0c" stroke="rgba(255,255,255,0.18)" />
      <rect x="7" y="6" width="18" height="20" rx="2" fill="none" stroke="#3dffa2" strokeWidth="1.6" />
      <line x1="7" y1="16" x2="25" y2="16" stroke="#3dffa2" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.2" fill="none" stroke="#3dffa2" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="0.9" fill="#3dffa2" />
    </svg>
  );
}
