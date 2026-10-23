import {
  captainPicks,
  differentialPicks,
  fixtureRunInsight,
  INSIGHT_CONFIG,
  type CongestionFlags,
  type FixtureTickerRow,
  type PlayerCard,
  type TeamStrength,
} from "../insights/index.ts";
import { ukDeadlineLabel } from "../dates.ts";
import { renderReport } from "./render.ts";
import { buildXPost } from "./x-post.ts";
import {
  REPORT_PAYLOAD_VERSION,
  type BuiltReport,
  type CongestionItem,
  type FixtureSwingItem,
  type ReportSection,
} from "./types.ts";

export interface PreviewReportInput {
  date: string;
  gameweek: number;
  deadlineUtc: string | null;
  generatedAt: string;
  cards: readonly PlayerCard[];
  ticker: readonly FixtureTickerRow[];
  strengths: ReadonlyMap<number, TeamStrength>;
  congestion: readonly CongestionFlags[];
}

/**
 * The pre-deadline preview: who to captain, who to differentiate with, whose
 * fixtures have turned, and who is squeezed by a midweek European game.
 *
 * Every pick is an ESTIMATE and says so.
 */
export function buildPreviewReport(input: PreviewReportInput): BuiltReport {
  const captains = captainPicks(input.cards);
  const differentials = differentialPicks(input.cards);
  const swings = fixtureSwings(input.ticker, input.strengths);
  const congestion = congestionItems(input.congestion, input.gameweek, input.strengths);

  const sections: ReportSection[] = [
    {
      kind: "captains",
      id: "captains",
      title: `Captain options — GW${input.gameweek}`,
      note: "Estimate. Ranked on expected points, goal threat, fixture and venue.",
      items: captains,
    },
    {
      kind: "differentials",
      id: "differentials",
      title: "Differentials under 10% owned",
      note: "Estimate. Form and fixtures only — no ownership prediction.",
      items: differentials,
    },
    {
      kind: "fixture_swings",
      id: "fixture-swings",
      title: "Best and worst fixture runs",
      items: swings,
    },
    {
      kind: "congestion",
      id: "congestion",
      title: "Champions League congestion",
      note: "Champions League games only — the free data source excludes other European competitions.",
      items: congestion,
    },
  ];

  // The deadline lives in the headline, written by code, so neither the
  // template nor the AI paragraph has to restate it.
  const headline = input.deadlineUtc
    ? `Gameweek ${input.gameweek} preview — deadline ${ukDeadlineLabel(input.deadlineUtc)}`
    : `Gameweek ${input.gameweek} preview`;
  const payload = {
    version: REPORT_PAYLOAD_VERSION,
    type: "preview" as const,
    date: input.date,
    gameweek: input.gameweek,
    generatedAt: input.generatedAt,
    headline,
    summary: {
      captains: captains.length,
      differentials: differentials.length,
      fixtureSwings: swings.length,
      congestion: congestion.length,
    },
    sections,
    xPost: previewXPost(input.gameweek, captains, differentials),
  };

  return { payload, messages: renderReport(payload) };
}

/** The three easiest and three hardest runs over the next few gameweeks. */
function fixtureSwings(
  ticker: readonly FixtureTickerRow[],
  strengths: ReadonlyMap<number, TeamStrength>,
): FixtureSwingItem[] {
  const teamIds = [...new Set(ticker.map((r) => r.teamFplId))];

  const runs = teamIds.map((teamFplId) => {
    const run = fixtureRunInsight(teamFplId, ticker, strengths, INSIGHT_CONFIG.fixtureRun.shortHorizon);
    return {
      teamFplId,
      team: strengths.get(teamFplId)?.shortName ?? String(teamFplId),
      band: run.band,
      adjustedDifficulty: run.adjustedDifficulty,
      blanks: run.blanks,
      doubles: run.doubles,
      fixtures: run.fixtures.map((f) => ({
        gameweek: f.gameweek,
        opponent: f.opponent,
        isHome: f.isHome,
        difficulty: f.difficulty,
      })),
    };
  });

  const sorted = [...runs].sort((a, b) => a.adjustedDifficulty - b.adjustedDifficulty);
  return [...sorted.slice(0, 3), ...sorted.slice(-3).reverse()];
}

function congestionItems(
  flags: readonly CongestionFlags[],
  gameweek: number,
  strengths: ReadonlyMap<number, TeamStrength>,
): CongestionItem[] {
  const seen = new Set<string>();
  return flags
    .filter((f) => f.gameweek === gameweek && (f.isAfterCl || f.isBeforeCl))
    .filter((f) => {
      const key = `${f.teamFplId}:${f.gameweek}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => ({
      // Resolve the name HERE, before rendering — a post-hoc fix to the
      // payload would leave the already-rendered text showing raw ids.
      team: strengths.get(f.teamFplId)?.shortName ?? String(f.teamFplId),
      gameweek: f.gameweek,
      isAfterCl: f.isAfterCl,
      isBeforeCl: f.isBeforeCl,
      daysSinceCl: f.daysSinceCl,
      daysUntilCl: f.daysUntilCl,
    }));
}

function previewXPost(
  gameweek: number,
  captains: readonly { webName: string; card: PlayerCard }[],
  differentials: readonly { webName: string; ownership: number }[],
): string {
  const facts: string[] = [];

  const top = captains[0];
  if (top) {
    facts.push(`${top.webName} ${top.card.epNext.toFixed(1)} xPts, ${top.card.goalThreat.band.toLowerCase()} threat`);
  }
  const second = captains[1];
  if (second) facts.push(`${second.webName} close behind`);

  const diff = differentials[0];
  if (diff) facts.push(`${diff.webName} just ${diff.ownership.toFixed(1)}% owned`);

  return buildXPost(`GW${gameweek} captain shortlist.`, facts, "#FPL");
}
