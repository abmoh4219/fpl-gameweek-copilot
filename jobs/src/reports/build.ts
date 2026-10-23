import {
  INSIGHT_CONFIG,
  buildDailyReport,
  buildPlayerCard,
  buildPreviewReport,
  ukDate,
  type BuiltReport,
  type CardInputs,
  type CongestionFlags,
  type PlayerCard,
  type StatusChangeItem,
} from "@fpl/shared";

import type { Db } from "../db.ts";
import {
  fetchCongestion,
  fetchFixtureTicker,
  fetchPlayerCurrent,
  fetchPlayerForm,
  fetchPriceChanges,
  fetchPriceWatch,
  fetchTeamStrengths,
} from "../load/insight-inputs.ts";

/**
 * Assembles the insight engine's inputs from the views and turns them into
 * report payloads. All arithmetic happens in packages/shared; this module
 * only fetches and wires.
 */
export interface EngineInputs {
  cards: PlayerCard[];
  cardsByPlayerId: Map<number, PlayerCard>;
  ticker: Awaited<ReturnType<typeof fetchFixtureTicker>>;
  strengths: Awaited<ReturnType<typeof fetchTeamStrengths>>;
  congestion: CongestionFlags[];
}

export async function loadEngineInputs(db: Db, forGameweek?: number): Promise<EngineInputs> {
  const [players, forms, ticker, strengths, congestionRows] = await Promise.all([
    fetchPlayerCurrent(db),
    fetchPlayerForm(db),
    fetchFixtureTicker(db),
    fetchTeamStrengths(db),
    fetchCongestion(db),
  ]);

  const relevant =
    forGameweek === undefined
      ? congestionRows
      : congestionRows.filter((c) => c.gameweek === forGameweek);

  // One entry per team, preferring a row that actually flags congestion.
  const congestionByTeam = new Map<number, CongestionFlags>();
  for (const row of relevant) {
    const existing = congestionByTeam.get(row.teamFplId);
    if (!existing || row.isAfterCl || row.isBeforeCl) congestionByTeam.set(row.teamFplId, row);
  }

  const inputs: CardInputs = { forms, ticker, strengths, congestion: congestionByTeam };
  const cards = players.map((p) => buildPlayerCard(p, inputs));

  return {
    cards,
    cardsByPlayerId: new Map(cards.map((c) => [c.playerId, c])),
    ticker,
    strengths,
    congestion: congestionRows,
  };
}

/**
 * A daily report plus the change_events it covers, so delivery can mark
 * exactly those as notified.
 */
export interface DailyBuild extends BuiltReport {
  eventIds: number[];
}

export async function buildDailyReportFrom(
  db: Db,
  options: { date?: string; gameweek: number | null },
): Promise<DailyBuild> {
  const date = options.date ?? ukDate();
  const engine = await loadEngineInputs(db, options.gameweek ?? undefined);

  const priceChangeRows = await fetchPriceChanges(db, date);
  const priceChanges = priceChangeRows.flatMap((row) => {
    const card = engine.cardsByPlayerId.get(row.playerId);
    if (!card) return [];
    return [
      {
        direction: row.direction === "rise" ? ("rise" as const) : ("fall" as const),
        changeM: row.changeM,
        card,
      },
    ];
  });

  const statusRows = await fetchDailyStatusRows(db, date);
  const statusChanges = toStatusItems(statusRows, engine.cardsByPlayerId);
  const priceWatch = await fetchPriceWatch(db);
  const priceEventIds = await fetchPriceEventIds(db, date);

  const report = buildDailyReport({
    date,
    gameweek: options.gameweek,
    generatedAt: new Date().toISOString(),
    priceChanges,
    statusChanges,
    priceWatch,
  });

  return { ...report, eventIds: [...priceEventIds, ...statusRows.map((r) => r.id)] };
}

interface StatusRow {
  id: number;
  playerId: number;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  importance: number;
}

function toStatusRow(row: Record<string, unknown>): StatusRow {
  return {
    id: Number(row["id"]),
    playerId: Number(row["player_id"]),
    oldValue: (row["old_value"] ?? {}) as Record<string, unknown>,
    newValue: (row["new_value"] ?? {}) as Record<string, unknown>,
    importance: Number(row["importance"] ?? 0),
  };
}

/**
 * Status and news changes detected since the PREVIOUS daily report, read
 * from what change detection already wrote — so the report and the alerts
 * can never disagree about what changed.
 *
 * A window rather than `occurred_on = date`: price-sync detects news
 * intraday, so Friday-afternoon news has Friday's date and the 02:37 Saturday
 * report would otherwise never include it. With no previous report, the
 * window falls back to the day before.
 */
async function fetchDailyStatusRows(db: Db, date: string): Promise<StatusRow[]> {
  const rows = await db<Record<string, unknown>[]>`
    select c.id, c.player_id, c.old_value, c.new_value, c.importance
    from core.change_events c
    where c.change_type in ('status_change', 'news_change')
      and c.occurred_on <= ${date}::date
      and c.detected_at > coalesce(
        (select max(r.created_at) from core.reports r
         where r.report_type = 'daily' and r.report_date < ${date}::date),
        ${date}::date - interval '1 day'
      )
    order by c.detected_at
  `;
  return rows.map(toStatusRow);
}

async function fetchPriceEventIds(db: Db, date: string): Promise<number[]> {
  const rows = await db<{ id: string }[]>`
    select id from core.change_events
    where change_type in ('price_rise', 'price_fall') and occurred_on = ${date}::date
  `;
  return rows.map((r) => Number(r.id));
}

/**
 * Undelivered news important enough to interrupt the day (ADR-0006).
 * Threshold and lookback come from INSIGHT_CONFIG.delivery.
 */
export async function fetchNewsAlertRows(db: Db): Promise<StatusRow[]> {
  const cfg = INSIGHT_CONFIG.delivery;
  const rows = await db<Record<string, unknown>[]>`
    select c.id, c.player_id, c.old_value, c.new_value, c.importance
    from core.change_events c
    where c.change_type in ('status_change', 'news_change')
      and c.notified_at is null
      and c.importance >= ${cfg.newsAlertMinImportance}
      and c.detected_at > now() - make_interval(hours => ${cfg.newsAlertLookbackHours})
    order by c.detected_at
  `;
  return rows.map(toStatusRow);
}

/**
 * Event rows to report items, one item per player: a status change and a
 * news edit for the same player read as one piece of news. Returns the event
 * ids behind each item so delivery can mark exactly what was sent.
 */
export function toStatusItems(
  rows: readonly StatusRow[],
  cards: ReadonlyMap<number, PlayerCard>,
): StatusChangeItem[] {
  return [...groupStatusRows(rows, cards).values()].map((g) => g.item);
}

export function groupStatusRows(
  rows: readonly StatusRow[],
  cards: ReadonlyMap<number, PlayerCard>,
): Map<number, { item: StatusChangeItem; eventIds: number[] }> {
  const byPlayer = new Map<number, { item: StatusChangeItem; eventIds: number[] }>();

  // Rows arrive oldest first, so the latest value for each field wins.
  for (const row of rows) {
    const card = cards.get(row.playerId);
    if (!card) continue;

    const existing = byPlayer.get(row.playerId);
    const status = row.newValue["status"];
    const news = row.newValue["news"];
    const previous = row.oldValue["status"];

    byPlayer.set(row.playerId, {
      item: {
        fplId: card.fplId,
        webName: card.webName,
        team: card.team,
        position: card.position,
        ownership: card.ownership,
        // the EARLIEST previous status, so d -> i after a -> d reads a -> i
        previousStatus:
          existing?.item.previousStatus ?? (typeof previous === "string" ? previous : null),
        status: typeof status === "string" ? status : (existing?.item.status ?? card.status),
        news: typeof news === "string" ? news : (existing?.item.news ?? card.news),
        chanceOfPlayingNextRound: card.chanceOfPlayingNextRound,
        minutesRiskBand: card.minutesRisk.band,
        importance: Math.max(row.importance, existing?.item.importance ?? 0),
      },
      eventIds: [...(existing?.eventIds ?? []), row.id],
    });
  }

  return byPlayer;
}

export async function buildPreviewReportFrom(
  db: Db,
  gameweek: number,
  deadlineUtc: string | null,
): Promise<BuiltReport> {
  const engine = await loadEngineInputs(db, gameweek);

  const report = buildPreviewReport({
    date: ukDate(),
    gameweek,
    deadlineUtc,
    generatedAt: new Date().toISOString(),
    cards: engine.cards,
    ticker: engine.ticker,
    strengths: engine.strengths,
    congestion: engine.congestion,
  });

  return report;
}
