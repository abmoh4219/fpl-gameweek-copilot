/**
 * A radar (spider) chart for 2-3 players on the same axes (ADR-0020). Axes
 * are percentiles among outfield players with real minutes, so every spoke
 * runs 0-100. One colour per player (the accent leads, then two validated
 * categorical colours), a faint fill so overlaps stay readable, and the raw
 * numbers always sit beside the chart.
 */
export const SERIES = ["var(--chart-hi)", "var(--cat-1)", "var(--cat-2)"] as const;

export function radarPoints(values: readonly number[], cx: number, cy: number, r: number): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const d = (Math.max(0, Math.min(100, v)) / 100) * r;
      return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`;
    })
    .join(" ");
}

export function RadarChart({
  axes,
  lines,
  summary,
}: {
  axes: readonly string[];
  lines: readonly { name: string; values: readonly number[] }[];
  summary: string;
}) {
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const r = 150;
  const n = axes.length;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label={summary}>
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={radarPoints(Array(n).fill(ring), cx, cy, r)} className="radar-ring" />
      ))}
      {axes.map((label, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + (r + 26) * Math.cos(a);
        const y = cy + (r + 26) * Math.sin(a);
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} className="radar-spoke" />
            <text x={x} y={y + 4} textAnchor={Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end"} className="radar-label">
              {label}
            </text>
          </g>
        );
      })}
      {lines.map((l, i) => (
        <polygon key={l.name} points={radarPoints(l.values, cx, cy, r)} className="radar-shape" style={{ ["--c" as string]: SERIES[i] }} />
      ))}
      {lines.map((l, i) =>
        l.values.map((v, k) => {
          const [x, y] = radarPoints([...Array(k).fill(0), v, ...Array(n - k - 1).fill(0)], cx, cy, r).split(" ")[k]!.split(",");
          return <circle key={`${l.name}-${k}`} cx={x} cy={y} r={3.5} className="radar-dot" style={{ ["--c" as string]: SERIES[i] }} />;
        }),
      )}
    </svg>
  );
}
