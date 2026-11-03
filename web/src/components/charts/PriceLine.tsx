"use client";

import { useEffect, useRef, useState } from "react";
import type { PricePoint } from "@fpl/shared";

/**
 * The price over time as a step line (a price holds until it changes): 2px,
 * one hue, a light wash under it, the current price labelled at the end and
 * every change a ringed dot with its own tooltip.
 */
export function PriceLine({ points, summary }: { points: PricePoint[]; summary: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return <p className="chart-empty">No price changes since we started tracking.</p>;

  const height = 200;
  const pad = { top: 18, right: 58, bottom: 26, left: 44 };
  const t = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
  const [t0, t1] = [t(points[0]!.date), t(points.at(-1)!.date)];
  const prices = points.map((p) => p.priceM);
  const lo = Math.min(...prices) - 0.1;
  const hi = Math.max(...prices) + 0.1;
  const x = (d: string) => pad.left + ((t(d) - t0) / Math.max(1, t1 - t0)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * (height - pad.top - pad.bottom);

  // Step path: hold the price, then jump on the change date.
  let d = `M${x(points[0]!.date)},${y(points[0]!.priceM)}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i]!.date)} V${y(points[i]!.priceM)}`;
  const area = `${d} V${height - pad.bottom} H${x(points[0]!.date)} Z`;
  const changes = points.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p.priceM !== points[i - 1]!.priceM);
  const ticks = [lo + 0.1, (lo + hi) / 2, hi - 0.1].map((v) => Math.round(v * 10) / 10);
  const fmtDate = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const last = points.at(-1)!;

  return (
    <div className="chart" ref={wrap}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={summary} onPointerLeave={() => setHover(null)}>
        {[...new Set(ticks)].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
              £{v.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={pad.left} y={height - 6} className="chart-tick">
          {fmtDate(points[0]!.date)}
        </text>
        <text x={width - pad.right} y={height - 6} textAnchor="end" className="chart-tick">
          {fmtDate(last.date)}
        </text>
        <path d={area} className="line-wash" />
        <path d={d} className="line-path" />
        {changes.map(({ p, i }) => (
          <g key={p.date} onPointerEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${fmtDate(p.date)}: £${p.priceM.toFixed(1)}m`}>
            <circle cx={x(p.date)} cy={y(p.priceM)} r={14} className="col-hit" />
            <circle cx={x(p.date)} cy={y(p.priceM)} r={4.5} className={`chart-dot ${p.priceM > points[i - 1]!.priceM ? "hi" : "lo"}${hover === i ? " is-hover" : ""}`} />
          </g>
        ))}
        <circle cx={x(last.date)} cy={y(last.priceM)} r={4.5} className="chart-dot hi" />
        <text x={x(last.date) + 10} y={y(last.priceM) + 4} className="chart-label">
          £{last.priceM.toFixed(1)}m
        </text>
      </svg>
      {hover !== null && points[hover] && (
        <div
          className="chart-tip"
          style={{ left: `${(x(points[hover]!.date) / width) * 100}%`, top: y(points[hover]!.priceM) - 10, transform: "translate(-50%, -100%)" }}
        >
          <b>{fmtDate(points[hover]!.date)}</b>
          <span>
            Price: <b>£{points[hover]!.priceM.toFixed(1)}m</b>
          </span>
          <small>
            {points[hover]!.priceM > points[hover - 1]!.priceM ? "▲" : "▼"} £{Math.abs(points[hover]!.priceM - points[hover - 1]!.priceM).toFixed(1)}m
          </small>
        </div>
      )}
    </div>
  );
}
