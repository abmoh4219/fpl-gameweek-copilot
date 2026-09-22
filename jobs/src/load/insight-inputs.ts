import type {
  CongestionFlags,
  FixtureTickerRow,
  PlayerCurrentRow,
  PlayerFormRow,
  PriceChangeRow,
  PriceWatchRow,
  TeamStrength,
} from "@fpl/shared";
import type { Db } from "../db.ts";

/**
 * Reads the insight engine's inputs from the views built in Phase 2 — never
 * from raw tables. The views own the SQL; these functions only map column
 * names onto the pure shapes the engine expects.
 */

const n = (value: unknown): number => Number(value ?? 0);

export async function fetchPlayerCurrent(db: Db): Promise<PlayerCurrentRow[]> {
  const rows = await db<Record<string, unknown>[]>`select * from core.player_current`;
  return rows.map((r) => ({
    playerId: n(r["player_id"]),
    fplId: n(r["fpl_id"]),
    webName: String(r["web_name"]),
    elementType: n(r["element_type"]),
    teamFplId: n(r["team_fpl_id"]),
    teamShortName: String(r["team_short_name"]),
    nowCost: n(r["now_cost"]),
    priceM: n(r["price_m"]),
    costChangeEvent: n(r["cost_change_event"]),
    status: String(r["status"]),
    news: String(r["news"] ?? ""),
    chanceOfPlayingNextRound:
      r["chance_of_playing_next_round"] === null ? null : n(r["chance_of_playing_next_round"]),
    selectedByPercent: n(r["selected_by_percent"]),
    netTransfersEvent: n(r["net_transfers_event"]),
    totalPoints: n(r["total_points"]),
    form: n(r["form"]),
    epNext: n(r["ep_next"]),
    minutes: n(r["minutes"]),
    starts: n(r["starts"]),
    expectedGoalInvolvements: n(r["expected_goal_involvements"]),
    expectedGoalInvolvementsPer90: n(r["expected_goal_involvements_per_90"]),
    penaltiesOrder: r["penalties_order"] === null ? null : n(r["penalties_order"]),
    cornersOrder:
      r["corners_and_indirect_freekicks_order"] === null
        ? null
        : n(r["corners_and_indirect_freekicks_order"]),
    freekicksOrder: r["direct_freekicks_order"] === null ? null : n(r["direct_freekicks_order"]),
  }));
}

export async function fetchPlayerForm(db: Db): Promise<Map<number, PlayerFormRow>> {
  const rows = await db<Record<string, unknown>[]>`select * from core.player_form`;
  return new Map(
    rows.map((r) => [
      n(r["player_id"]),
      {
        playerId: n(r["player_id"]),
        gameweeksLast4: n(r["gameweeks_last_4"]),
        pointsLast4: n(r["points_last_4"]),
        minutesLast4: n(r["minutes_last_4"]),
        startsLast4: n(r["starts_last_4"]),
        xgiLast4: n(r["xgi_last_4"]),
        xgiPer90Last4: n(r["xgi_per_90_last_4"]),
        pointsLast6: n(r["points_last_6"]),
        minutesLast6: n(r["minutes_last_6"]),
        xgiPer90Last6: n(r["xgi_per_90_last_6"]),
      },
    ]),
  );
}

export async function fetchFixtureTicker(db: Db): Promise<FixtureTickerRow[]> {
  const rows = await db<Record<string, unknown>[]>`
    select team_fpl_id, gameweek, gw_offset, is_home, opponent_short_name,
           opponent_team_id, difficulty, is_blank, is_double
    from core.fixture_ticker
  `;
  // opponent_team_id is a surrogate id; map it to the FPL id the engine uses.
  const teams = await db<{ id: string; fpl_id: number }[]>`select id, fpl_id from core.teams`;
  const fplIdBySurrogate = new Map(teams.map((t) => [Number(t.id), Number(t.fpl_id)]));

  return rows.map((r) => ({
    teamFplId: n(r["team_fpl_id"]),
    gameweek: n(r["gameweek"]),
    gwOffset: n(r["gw_offset"]),
    isHome: r["is_home"] === null ? null : Boolean(r["is_home"]),
    opponentShortName: r["opponent_short_name"] === null ? null : String(r["opponent_short_name"]),
    opponentTeamFplId:
      r["opponent_team_id"] === null ? null : (fplIdBySurrogate.get(n(r["opponent_team_id"])) ?? null),
    difficulty: r["difficulty"] === null ? null : n(r["difficulty"]),
    isBlank: Boolean(r["is_blank"]),
    isDouble: Boolean(r["is_double"]),
  }));
}

export async function fetchTeamStrengths(db: Db): Promise<Map<number, TeamStrength>> {
  const rows = await db<Record<string, unknown>[]>`
    select fpl_id, short_name, strength_overall_home, strength_overall_away,
           strength_defence_home, strength_defence_away
    from core.teams
  `;
  return new Map(
    rows.map((r) => [
      n(r["fpl_id"]),
      {
        teamFplId: n(r["fpl_id"]),
        shortName: String(r["short_name"]),
        strengthOverallHome: n(r["strength_overall_home"]),
        strengthOverallAway: n(r["strength_overall_away"]),
        strengthDefenceHome: n(r["strength_defence_home"]),
        strengthDefenceAway: n(r["strength_defence_away"]),
      },
    ]),
  );
}

export async function fetchCongestion(db: Db): Promise<CongestionFlags[]> {
  const rows = await db<Record<string, unknown>[]>`
    select team_fpl_id, gameweek, is_after_cl, is_before_cl, days_since_cl, days_until_cl
    from core.cl_congestion
  `;
  return rows.map((r) => ({
    teamFplId: n(r["team_fpl_id"]),
    gameweek: n(r["gameweek"]),
    isAfterCl: Boolean(r["is_after_cl"]),
    isBeforeCl: Boolean(r["is_before_cl"]),
    daysSinceCl: r["days_since_cl"] === null ? null : n(r["days_since_cl"]),
    daysUntilCl: r["days_until_cl"] === null ? null : n(r["days_until_cl"]),
  }));
}

export async function fetchPriceWatch(db: Db): Promise<PriceWatchRow[]> {
  // momentum and hourly_rate are deliberately NOT selected: the hypothesis
  // behind them is unvalidated and must not reach a report.
  const rows = await db<Record<string, unknown>[]>`
    select player_id, fpl_id, web_name, team_short_name, price_m,
           price_change_percent, direction, is_locked
    from core.price_watch
  `;
  return rows.map((r) => ({
    playerId: n(r["player_id"]),
    fplId: n(r["fpl_id"]),
    webName: String(r["web_name"]),
    teamShortName: String(r["team_short_name"]),
    priceM: n(r["price_m"]),
    priceChangePercent:
      r["price_change_percent"] === null ? null : n(r["price_change_percent"]),
    direction: String(r["direction"]),
    isLocked: Boolean(r["is_locked"]),
  }));
}

export async function fetchPriceChanges(db: Db, changedOn: string): Promise<PriceChangeRow[]> {
  const rows = await db<Record<string, unknown>[]>`
    select player_id, fpl_id, web_name, element_type, team_short_name,
           change_tenths, change_m, price_m, direction
    from core.price_changes_daily
    where changed_on = ${changedOn}::date
  `;
  return rows.map((r) => ({
    playerId: n(r["player_id"]),
    fplId: n(r["fpl_id"]),
    webName: String(r["web_name"]),
    elementType: n(r["element_type"]),
    teamShortName: String(r["team_short_name"]),
    changeTenths: n(r["change_tenths"]),
    changeM: n(r["change_m"]),
    priceM: n(r["price_m"]),
    direction: String(r["direction"]),
  }));
}
