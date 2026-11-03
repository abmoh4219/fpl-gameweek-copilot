"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartPoint } from "@fpl/shared";

/**
 * A hand-built SVG scatter, themed by tokens (no chart library).
 *
 * Follows the dataviz rules: one axis per dimension, hairline solid grid,
 * >= 8px dots with a 2px surface ring, emphasis colour on the story's points
 * and a quiet base for context, direct labels only on the labelled points
 * (skipped rather than overlapped), and a nearest-point hover layer so the
 * pointer only has to be closest, not dead-centre. The leaderboard tables on
 * the same page are the table view.
 */
export interface Axis {
  label: string;
  format: (v: number) => string;
  log?: boolean;
  /** Force the domain to start at zero (linear only). */
  zero?: boolean;
  /** Flip the direction, e.g. so "easier" (a lower number) sits at the top. */
  reverse?: boolean;
}

interface Props {
  points: ChartPoint[];
  x: Axis;
  y: Axis;
  /** Draw y = x (same units on both axes). */
  diagonal?: boolean;
  /** A shaded region with a caption, in data units. */
  zone?: { x0: number; x1: number; y0: number; y1: number; label: string };
  /** Accessible summary of what the chart shows. */
  summary: string;
  /** Tooltip extra line, e.g. "+3.1 goals over xG". */
  detail?: (p: ChartPoint) => string;
  /** Where a click (or Enter on a labelled dot) takes the reader; omit for points that aren't players. */
  href?: (p: ChartPoint) => string;
}

const PAD = { top: 16, right: 18, bottom: 44, left: 48 };

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

const LOG_TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

function scale(axis: Axis, values: number[], range0: [number, number]) {
  const range: [number, number] = axis.reverse ? [range0[1], range0[0]] : range0;
  if (axis.log) {
    const lo = Math.max(0.1, Math.min(...values));
    const hi = Math.max(lo * 10, Math.max(...values));
    const [a, b] = [Math.log10(lo), Math.log10(hi)];
    const f = (v: number) => range[0] + ((Math.log10(Math.max(v, lo)) - a) / (b - a)) * (range[1] - range[0]);
    return { f, lo, hi, ticks: LOG_TICKS.filter((t) => t >= lo * 0.999 && t <= hi * 1.001) };
  }
  const lo0 = axis.zero ? 0 : Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = (hi0 - lo0) * 0.06 || 1;
  const lo = axis.zero ? 0 : lo0 - pad;
  const hi = hi0 + pad;
  const ticks = niceTicks(lo, hi);
  const f = (v: number) => range[0] + ((v - lo) / (hi - lo)) * (range[1] - range[0]);
  return { f, lo, hi, ticks };
}

export function ScatterPlot({ points, x, y, diagonal, zone, summary, detail, href }: Props) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<ChartPoint | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 560 ? 320 : 400;
  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // On a y = x chart both axes share one domain, so the diagonal is honest.
    const shared = diagonal ? [...xs, ...ys] : null;
    const sx = scale(x, shared ?? xs, [PAD.left, width - PAD.right]);
    const sy = scale(y, shared ?? ys, [height - PAD.bottom, PAD.top]);
    const placed = points.map((p) => ({ p, cx: sx.f(p.x), cy: sy.f(p.y) }));

    // Direct labels: right of the dot, else left; skipped if it would collide.
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const labels: { id: number; text: string; tx: number; ty: number; anchor: "start" | "end" }[] = [];
    const hit = (b: (typeof boxes)[number]) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    // Highlighted dots are obstacles too: a label never covers another story point.
    for (const d of placed) if (d.p.labelled) boxes.push({ x0: d.cx - 7, x1: d.cx + 7, y0: d.cy - 7, y1: d.cy + 7 });
    for (const { p, cx, cy } of placed.filter((d) => d.p.labelled).sort((a, b) => a.cy - b.cy)) {
      const w = p.label.length * 6.6 + 4;
      for (const side of ["right", "left"] as const) {
        const x0 = side === "right" ? cx + 8 : cx - 8 - w;
        // Starts 8px off its own dot, so its own obstacle box (7px) never blocks it.
        const box = { x0, x1: x0 + w, y0: cy - 8, y1: cy + 8 };
        if (box.x0 < PAD.left || box.x1 > width - 4 || hit(box)) continue;
        boxes.push(box);
        labels.push({ id: p.fplId, text: p.label, tx: side === "right" ? cx + 8 : cx - 8, ty: cy + 4, anchor: side === "right" ? "start" : "end" });
        break;
      }
    }
    return { sx, sy, placed, labels };
  }, [points, x, y, diagonal, width, height]);

  if (!geo) return <p className="chart-empty">Not enough data yet.</p>;
  const { sx, sy, placed, labels } = geo;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * width;
    const my = ((e.clientY - r.top) / r.height) * height;
    let best: (typeof placed)[number] | null = null;
    let bestD = 28 * 28;
    for (const d of placed) {
      const dd = (d.cx - mx) ** 2 + (d.cy - my) ** 2;
      if (dd < bestD) [best, bestD] = [d, dd];
    }
    setHover(best?.p ?? null);
  };

  const hovered = hover ? placed.find((d) => d.p.fplId === hover.fplId) : null;
  const order = { base: 0, lo: 1, hi: 2 } as const;
  const drawn = [...placed].sort((a, b) => order[a.p.tone] - order[b.p.tone] || Number(a.p.labelled) - Number(b.p.labelled));
  const [x0, x1] = [PAD.left, width - PAD.right];
  const [y0, y1] = [height - PAD.bottom, PAD.top];

  return (
    <div className="chart" ref={wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={summary}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        // The nearest dot is the target, so a click lands where the tooltip points.
        onClick={() => hover && href && router.push(href(hover))}
        className={href && hover ? "is-clickable" : undefined}
      >
        {/* grid and axes: hairline, solid, recessive */}
        {sy.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={x0} x2={x1} y1={sy.f(t)} y2={sy.f(t)} className="chart-grid" />
            <text x={x0 - 8} y={sy.f(t) + 4} className="chart-tick" textAnchor="end">
              {y.format(t)}
            </text>
          </g>
        ))}
        {sx.ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx.f(t)} x2={sx.f(t)} y1={y0} y2={y1} className="chart-grid" />
            <text x={sx.f(t)} y={y0 + 18} className="chart-tick" textAnchor="middle">
              {x.format(t)}
            </text>
          </g>
        ))}
        <text x={(x0 + x1) / 2} y={height - 6} className="chart-axis" textAnchor="middle">
          {x.label}
        </text>
        <text x={14} y={(y0 + y1) / 2} className="chart-axis" textAnchor="middle" transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>
          {y.label}
        </text>

        {zone && (
          <g>
            <rect
              x={Math.max(x0, sx.f(zone.x0))}
              y={Math.max(y1, sy.f(zone.y1))}
              width={Math.max(0, Math.min(x1, sx.f(zone.x1)) - Math.max(x0, sx.f(zone.x0)))}
              height={Math.max(0, Math.min(y0, sy.f(zone.y0)) - Math.max(y1, sy.f(zone.y1)))}
              className="chart-zone"
            />
            <text x={Math.max(x0, sx.f(zone.x0)) + 8} y={Math.max(y1, sy.f(zone.y1)) + 16} className="chart-zone-label">
              {zone.label}
            </text>
          </g>
        )}

        {diagonal && (
          <line x1={sx.f(Math.max(sx.lo, 0))} y1={sy.f(Math.max(sx.lo, 0))} x2={sx.f(sx.hi)} y2={sy.f(sx.hi)} className="chart-diagonal" />
        )}

        {drawn.map(({ p, cx, cy }) => (
          <circle
            key={p.fplId}
            cx={cx}
            cy={cy}
            r={p.tone === "base" ? 4.5 : 6}
            className={`chart-dot ${p.tone}${hover?.fplId === p.fplId ? " is-hover" : ""}`}
            tabIndex={p.labelled ? 0 : -1}
            aria-label={p.labelled ? `${p.label}: ${x.label} ${x.format(p.x)}, ${y.label} ${y.format(p.y)}` : undefined}
            onFocus={() => setHover(p)}
            onKeyDown={(e) => {
              if (href && e.key === "Enter") router.push(href(p));
            }}
            onBlur={() => setHover(null)}
          />
        ))}

        {labels.map((l) => (
          <text key={l.id} x={l.tx} y={l.ty} textAnchor={l.anchor} className="chart-label">
            {l.text}
          </text>
        ))}
      </svg>

      {hover && hovered && (
        <div
          className="chart-tip"
          style={{
            left: `${(hovered.cx / width) * 100}%`,
            top: hovered.cy,
            transform: `translate(${hovered.cx > width * 0.6 ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <b>{hover.label}</b>
          <small>{hover.sub}</small>
          <span>
            {x.label}: <b>{x.format(hover.x)}</b>
          </span>
          <span>
            {y.label}: <b>{y.format(hover.y)}</b>
          </span>
          {detail && <em>{detail(hover)}</em>}
          {href && <small className="chart-tip-go">Click to open →</small>}
        </div>
      )}
    </div>
  );
}
