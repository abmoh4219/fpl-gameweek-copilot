"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Columns over gameweeks: <= 24px thick, 4px rounded data-end, square at the
 * baseline, one hue. Each column is its own hover target (the whole band, not
 * just the painted bar). Only the best column is direct-labelled.
 */
export interface Column {
  key: string;
  label: string;
  value: number;
  /** Tooltip lines below the value. */
  detail?: string[];
  /** A blank (no fixture): drawn as a dash, not a zero bar. */
  blank?: boolean;
}

/** Named, not a function: server pages render this chart and can't pass functions to it. */
export type ColumnFormat = "int" | "dec2";

const FORMATS: Record<ColumnFormat, (v: number) => string> = {
  int: (v) => String(Math.round(v)),
  dec2: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2)),
};

export function ColumnChart({ columns, format: kind, summary, height = 220, tone = "hi" }: { columns: Column[]; format: ColumnFormat; summary: string; height?: number; tone?: "hi" | "lo" }) {
  const format = FORMATS[kind];
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

  if (columns.length === 0) return <p className="chart-empty">No gameweeks yet.</p>;
  const pad = { top: 22, right: 6, bottom: 26, left: 32 };
  const max = Math.max(1, ...columns.map((c) => c.value));
  const minV = Math.min(0, ...columns.map((c) => c.value));
  const plotW = width - pad.left - pad.right;
  const band = plotW / columns.length;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => pad.top + ((max - v) / (max - minV)) * (height - pad.top - pad.bottom);
  const base = y(0);
  const step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 25 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const best = columns.reduce((b, c, i) => (c.value > (columns[b]?.value ?? -Infinity) ? i : b), 0);
  // Every other gameweek label when the bands get narrow.
  const every = band < 26 ? 2 : 1;

  return (
    <div className="chart" ref={wrap}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={summary} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {format(t)}
            </text>
          </g>
        ))}
        {columns.map((c, i) => {
          const cx = pad.left + band * i + band / 2;
          const top = y(Math.max(c.value, 0));
          const bottom = y(Math.min(c.value, 0));
          const h = Math.max(0, bottom - top);
          const r = Math.min(4, h);
          const up = c.value >= 0;
          // Rounded at the data end, square at the baseline.
          const d = up
            ? `M${cx - barW / 2},${bottom} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${bottom} Z`
            : `M${cx - barW / 2},${top} V${bottom - r} Q${cx - barW / 2},${bottom} ${cx - barW / 2 + r},${bottom} H${cx + barW / 2 - r} Q${cx + barW / 2},${bottom} ${cx + barW / 2},${bottom - r} V${top} Z`;
          return (
            <g
              key={c.key}
              className={`col${hover === i ? " is-hover" : ""}`}
              onPointerEnter={() => setHover(i)}
              tabIndex={0}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${c.label}: ${c.blank ? "no fixture" : format(c.value)}`}
            >
              <rect x={cx - band / 2} y={pad.top} width={band} height={height - pad.top - pad.bottom} className="col-hit" />
              {c.blank ? (
                <line x1={cx - barW / 3} x2={cx + barW / 3} y1={base - 1} y2={base - 1} className="col-blank" />
              ) : (
                h > 0 && <path d={d} className={`col-bar ${tone}${c.value < 0 ? " neg" : ""}`} />
              )}
              {i === best && c.value > 0 && (
                <text x={cx} y={top - 6} textAnchor="middle" className="chart-label">
                  {format(c.value)}
                </text>
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="chart-tick">
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={base} y2={base} className="chart-base" />
      </svg>
      {hover !== null && columns[hover] && (
        <div
          className="chart-tip"
          style={{
            left: `${((pad.left + band * hover + band / 2) / width) * 100}%`,
            top: Math.max(8, y(Math.max(columns[hover]!.value, 0)) - 8),
            transform: "translate(-50%, -100%)",
          }}
        >
          <b>{columns[hover]!.label}</b>
          <span>
            <b>{columns[hover]!.blank ? "No fixture" : format(columns[hover]!.value)}</b>
          </span>
          {columns[hover]!.detail?.map((l) => (
            <small key={l}>{l}</small>
          ))}
        </div>
      )}
    </div>
  );
}
