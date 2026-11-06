"use client";

import { useMemo, useState } from "react";
import {
  INSIGHT_CONFIG,
  differentialChart,
  finishingChart,
  kitImageUrl,
  statHeadlines,
  valueChart,
  type ChartPoint,
  type StatPosition,
  type StatRow,
} from "@fpl/shared";
import { ScatterPlot, type Axis } from "@/components/charts/ScatterPlot";
import "@/components/charts/charts.css";
import { How } from "@/components/charts/How";

/**
 * The stats page's insights: four headline tiles, then one chart at a time
 * from three questions every FPL manager asks. The leaderboards below are
 * the table view for the same numbers.
 */
type ChartId = "finishing" | "value" | "differentials";

const POSITIONS: { id: StatPosition | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "DEF", label: "DEF" },
  { id: "MID", label: "MID" },
  { id: "FWD", label: "FWD" },
];

const int = (v: number) => String(Math.round(v));
const dec1 = (v: number) => v.toFixed(1);
const pct = (v: number) => (v < 1 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

export function StatsInsights({ rows }: { rows: StatRow[] }) {
  const [chart, setChart] = useState<ChartId>("finishing");
  const [position, setPosition] = useState<StatPosition | null>(null);
  const headlines = useMemo(() => statHeadlines(rows), [rows]);
  const { differentialOwnership } = INSIGHT_CONFIG.stats;

  const view = useMemo(() => {
    if (chart === "finishing") {
      return {
        title: "Who's finishing above their chances?",
        how: "Each dot is a player. Above the line they've scored more than their chances (xG) suggest, which often doesn't last. Below it they've been unlucky, and goals may be coming.",
        points: finishingChart(rows, position),
        x: { label: "Expected goals (xG)", format: dec1, zero: true } satisfies Axis,
        y: { label: "Goals", format: int, zero: true } satisfies Axis,
        diagonal: true,
        key: [
          ["hi", "Scoring above xG"],
          ["lo", "Scoring below xG"],
          ["line", "Goals = xG"],
        ],
        detail: (p: ChartPoint) => {
          const d = p.y - p.x;
          return `${d >= 0 ? "+" : ""}${d.toFixed(1)} goals vs xG`;
        },
      };
    }
    if (chart === "value") {
      return {
        title: "Where's the value?",
        how: "Season points against price. The highlighted players return the most points per £m: cheap players up high are the bargains.",
        points: valueChart(rows, position),
        x: { label: "Price (£m)", format: (v: number) => `£${v.toFixed(1)}` } satisfies Axis,
        y: { label: "Season points", format: int, zero: true } satisfies Axis,
        diagonal: false,
        key: [
          ["hi", "Most points per £m"],
          ["base", "Everyone else"],
        ],
        detail: (p: ChartPoint) => `${(p.y / p.x).toFixed(1)} points per £m`,
      };
    }
    return {
      title: "Differentials: in form, barely owned",
      how: `Form against ownership (log scale). The shaded zone is under ${differentialOwnership}% owned: an in-form player there gains you rank on most managers.`,
      points: differentialChart(rows, position),
      x: { label: "Owned by (% of managers)", format: pct, log: true } satisfies Axis,
      y: { label: "Form", format: dec1, zero: true } satisfies Axis,
      diagonal: false,
      key: [
        ["hi", `In form, under ${differentialOwnership}% owned`],
        ["base", "Everyone else"],
      ],
      detail: (p: ChartPoint) => `Owned by ${p.x.toFixed(1)}%`,
    };
  }, [chart, rows, position, differentialOwnership]);

  const zone =
    chart === "differentials"
      ? { x0: 0.1, x1: differentialOwnership, y0: 0, y1: Math.max(...view.points.map((p) => p.y), 1) * 1.06, label: "Differential zone" }
      : undefined;

  return (
    <div className="ins">
      <div className="ins-tiles">
        {headlines.map((h) => (
          <div className="ins-tile" key={h.id}>
            <span className="ins-tile-label">{h.label}</span>
            <span className="ins-tile-value">{h.value}</span>
            <span className="ins-tile-who">
              <img src={kitImageUrl(h.row.teamCode, h.row.position === "GKP", 66)} alt="" loading="lazy" referrerPolicy="no-referrer" width={22} height={29} />
              <b>{h.row.webName}</b> {h.row.team}
            </span>
          </div>
        ))}
      </div>

      <div className="ins-card">
        <div className="ins-bar">
          <div className="st-seg" role="group" aria-label="Chart">
            {(
              [
                ["finishing", "Finishing"],
                ["value", "Value"],
                ["differentials", "Differentials"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={chart === id ? "is-on" : ""} aria-pressed={chart === id} onClick={() => setChart(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="st-seg" role="group" aria-label="Position">
            {POSITIONS.map((p) => (
              <button key={p.label} type="button" className={position === p.id ? "is-on" : ""} aria-pressed={position === p.id} onClick={() => setPosition(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <h2 className="ins-title">{view.title}</h2>
        <How>{view.how}</How>
        <ScatterPlot
          points={view.points}
          x={view.x}
          y={view.y}
          diagonal={view.diagonal}
          detail={view.detail}
          href={(p) => `/players/${p.fplId}`}
          summary={`${view.title} ${view.points.length} players plotted; ${view.points.filter((p) => p.labelled).map((p) => p.label).join(", ")} highlighted.`}
          {...(zone ? { zone } : {})}
        />
        <ul className="chart-key">
          {view.key.map(([tone, label]) => (
            <li key={label}>
              <i className={tone} />
              {label}
            </li>
          ))}
          <li className="ins-note">Players with {INSIGHT_CONFIG.stats.chartMinMinutes}+ minutes. Hover a dot for details.</li>
        </ul>
      </div>
    </div>
  );
}
