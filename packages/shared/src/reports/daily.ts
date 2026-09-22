import { INSIGHT_CONFIG } from "../insights/config.ts";
import { priceWatchPicks, type PlayerCard, type PriceWatchRow } from "../insights/index.ts";
import { renderReport, formatCount, statusLabel } from "./render.ts";
import { buildXPost } from "./x-post.ts";
import {
  REPORT_PAYLOAD_VERSION,
  type BuiltReport,
  type PriceChangeItem,
  type ReportSection,
  type StatusChangeItem,
} from "./types.ts";

export interface DailyReportInput {
  date: string;
  gameweek: number | null;
  generatedAt: string;
  /** Confirmed changes from core.price_changes_daily, with a card each. */
  priceChanges: { direction: "rise" | "fall"; changeM: number; card: PlayerCard }[];
  /** Status and news changes detected today. */
  statusChanges: StatusChangeItem[];
  /** Latest telemetry, for the estimated risers and fallers. */
  priceWatch: readonly PriceWatchRow[];
}

/**
 * The daily report: what actually changed overnight, then what looks likely
 * to change next — clearly separated, because one is fact and one is an
 * estimate.
 */
export function buildDailyReport(input: DailyReportInput): BuiltReport {
  const cfg = INSIGHT_CONFIG.report;

  const rises = input.priceChanges.filter((c) => c.direction === "rise");
  const falls = input.priceChanges.filter((c) => c.direction === "fall");
  const watch = priceWatchPicks(input.priceWatch);

  const toItem = (c: DailyReportInput["priceChanges"][number]): PriceChangeItem => ({
    fplId: c.card.fplId,
    webName: c.card.webName,
    team: c.card.team,
    position: c.card.position,
    priceM: c.card.priceM,
    changeM: c.changeM,
    direction: c.direction,
    card: c.card,
  });

  const byOwnership = (a: PriceChangeItem, b: PriceChangeItem) => b.card.ownership - a.card.ownership;

  const sections: ReportSection[] = [
    {
      kind: "price_changes",
      id: "risers",
      title: `Price rises (${rises.length})`,
      items: rises.map(toItem).sort(byOwnership).slice(0, cfg.topPriceChanges),
    },
    {
      kind: "price_changes",
      id: "fallers",
      title: `Price falls (${falls.length})`,
      items: falls.map(toItem).sort(byOwnership).slice(0, cfg.topPriceChanges),
    },
    {
      kind: "status_changes",
      id: "availability",
      title: `Injury and availability news (${input.statusChanges.length})`,
      items: [...input.statusChanges]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, cfg.topStatusChanges),
    },
    {
      kind: "price_watch",
      id: "watch-risers",
      title: "Likely to rise next",
      note: "Estimate, from FPL's own price-change data. Not a confirmed change.",
      items: watch.risers,
    },
    {
      kind: "price_watch",
      id: "watch-fallers",
      title: "Likely to fall next",
      note: "Estimate, from FPL's own price-change data. Not a confirmed change.",
      items: watch.fallers,
    },
  ];

  const headline = `FPL price report — ${input.date}`;
  const payload = {
    version: REPORT_PAYLOAD_VERSION,
    type: "daily" as const,
    date: input.date,
    gameweek: input.gameweek,
    generatedAt: input.generatedAt,
    headline,
    summary: {
      rises: rises.length,
      falls: falls.length,
      statusChanges: input.statusChanges.length,
      watchRisers: watch.risers.length,
      watchFallers: watch.fallers.length,
    },
    sections,
    xPost: dailyXPost(input, rises.map(toItem), falls.map(toItem)),
  };

  return { payload, messages: renderReport(payload) };
}

function dailyXPost(
  input: DailyReportInput,
  rises: readonly PriceChangeItem[],
  falls: readonly PriceChangeItem[],
): string {
  const facts: string[] = [];

  const topRise = [...rises].sort((a, b) => b.card.ownership - a.card.ownership)[0];
  if (topRise) {
    facts.push(`${topRise.webName} £${topRise.priceM.toFixed(1)}m (${topRise.card.ownership.toFixed(1)}% owned)`);
  }
  const topFall = [...falls].sort((a, b) => b.card.ownership - a.card.ownership)[0];
  if (topFall) {
    facts.push(`${topFall.webName} down to £${topFall.priceM.toFixed(1)}m`);
  }
  const topNews = [...input.statusChanges].sort((a, b) => b.importance - a.importance)[0];
  if (topNews) {
    facts.push(`${topNews.webName} now ${statusLabel(topNews.status)}`);
  }

  const hook =
    rises.length + falls.length === 0
      ? `No FPL price changes overnight (${input.date}).`
      : `${rises.length} rises, ${falls.length} falls overnight.`;

  return buildXPost(hook, facts, "#FPL");
}

export { formatCount };
