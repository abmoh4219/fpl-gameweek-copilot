import {
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

export async function buildDailyReportFrom(
  db: Db,
  options: { date?: string; gameweek: number | null },
): Promise<BuiltReport> {
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

  const statusChanges = await fetchStatusChanges(db, date, engine.cardsByPlayerId);
  const priceWatch = await fetchPriceWatch(db);

  return buildDailyReport({
    date,
    gameweek: options.gameweek,
    generatedAt: new Date().toISOString(),
    priceChanges,
    statusChanges,
    priceWatch,
  });
}

/**
 * Today's status and news changes, read from what change detection already
 * wrote — so the report and the alerts can never disagree about what changed.
 */
async function fetchStatusChanges(
  db: Db,
  date: string,
  cards: ReadonlyMap<number, PlayerCard>,
): Promise<StatusChangeItem[]> {
  const rows = await db<Record<string, unknown>[]>`
    select distinct on (c.player_id, c.change_type)
      c.player_id, c.change_type, c.old_value, c.new_value, c.importance
    from core.change_events c
    where c.occurred_on = ${date}::date
      and c.change_type in ('status_change', 'news_change')
    order by c.player_id, c.change_type, c.detected_at desc
  `;

  const byPlayer = new Map<number, StatusChangeItem>();

  for (const row of rows) {
    const playerId = Number(row["player_id"]);
    const card = cards.get(playerId);
    if (!card) continue;

    const oldValue = (row["old_value"] ?? {}) as Record<string, unknown>;
    const newValue = (row["new_value"] ?? {}) as Record<string, unknown>;
    const existing = byPlayer.get(playerId);
    const importance = Number(row["importance"] ?? 0);

    byPlayer.set(playerId, {
      fplId: card.fplId,
      webName: card.webName,
      team: card.team,
      position: card.position,
      ownership: card.ownership,
      previousStatus:
        typeof oldValue["status"] === "string"
          ? (oldValue["status"] as string)
          : (existing?.previousStatus ?? null),
      status: typeof newValue["status"] === "string" ? (newValue["status"] as string) : card.status,
      news: typeof newValue["news"] === "string" ? (newValue["news"] as string) : card.news,
      chanceOfPlayingNextRound: card.chanceOfPlayingNextRound,
      minutesRiskBand: card.minutesRisk.band,
      importance: Math.max(importance, existing?.importance ?? 0),
    });
  }

  return [...byPlayer.values()];
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
