"use client";

import { useMemo } from "react";
import { teamTargetChart, type TeamTarget } from "@fpl/shared";
import { ScatterPlot } from "@/components/charts/ScatterPlot";
import "@/components/charts/charts.css";

/** Attack against fixtures: the clubs worth owning players from over the next five gameweeks. */
export function TeamTargets({ targets }: { targets: TeamTarget[] }) {
  const points = useMemo(() => teamTargetChart(targets), [targets]);
  const picks = points.filter((p) => p.tone === "hi").map((p) => p.label);
  return (
    <div className="ins-card fx-targets">
      <h2 className="ins-title">Teams to target</h2>
      <p className="ins-how">
        Each club&apos;s attack (season xG) against how hard its next five gameweeks are. Top right is where you want
        players from: clubs that create a lot and face an easy run. Fixture difficulty is an estimate.
      </p>
      <ScatterPlot
        points={points}
        x={{ label: "Attack: season xG", format: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)), zero: false }}
        y={{ label: "Next 5 difficulty (easier is higher)", format: (v) => v.toFixed(1), reverse: true }}
        summary={`Teams to target: ${points.length} clubs plotted by season xG and next-five fixture difficulty. Best combined: ${picks.join(", ")}.`}
        detail={(p) => p.sub}
      />
      <ul className="chart-key">
        <li>
          <i className="hi" />
          Best attack and fixtures combined
        </li>
        <li>
          <i className="base" />
          Other clubs
        </li>
      </ul>
    </div>
  );
}
