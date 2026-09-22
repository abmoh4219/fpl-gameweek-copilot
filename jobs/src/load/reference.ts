import type { BootstrapStatic, Fixture } from "@fpl/shared";
import { toFootballDataId } from "@fpl/shared";
import type { Db } from "../db.ts";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Reference data: seasons, teams, players, gameweeks, fixtures.
 * All upserts are idempotent on the table's natural unique key.
 */

export async function loadSeason(db: Db, name: string): Promise<number> {
  const [row] = await db<{ id: string }[]>`
    insert into core.seasons (name, is_current)
    values (${name}, true)
    on conflict (name) do update set is_current = true
    returning id
  `;
  if (!row) throw new Error(`Failed to upsert season ${name}`);
  await db`update core.seasons set is_current = false where name <> ${name}`;
  return Number(row.id);
}

export async function loadTeams(
  db: Db,
  seasonId: number,
  bootstrap: BootstrapStatic,
): Promise<{ result: LoadResult; teamIds: Map<number, number> }> {
  const rows = bootstrap.teams.map((t) => ({
    season_id: seasonId,
    fpl_id: t.id,
    fpl_code: t.code,
    name: t.name,
    short_name: t.short_name,
    // Derived from the reviewed team map, never from a TLA.
    football_data_id: toFootballDataId(t.id) ?? null,
    strength: t.strength,
    strength_overall_home: t.strength_overall_home,
    strength_overall_away: t.strength_overall_away,
    strength_attack_home: t.strength_attack_home,
    strength_attack_away: t.strength_attack_away,
    strength_defence_home: t.strength_defence_home,
    strength_defence_away: t.strength_defence_away,
  }));

  await db`
    insert into core.teams ${db(
      rows,
      "season_id", "fpl_id", "fpl_code", "name", "short_name", "football_data_id",
      "strength", "strength_overall_home", "strength_overall_away",
      "strength_attack_home", "strength_attack_away",
      "strength_defence_home", "strength_defence_away",
    )}
    on conflict (season_id, fpl_id) do update set
      fpl_code              = excluded.fpl_code,
      name                  = excluded.name,
      short_name            = excluded.short_name,
      football_data_id      = excluded.football_data_id,
      strength              = excluded.strength,
      strength_overall_home = excluded.strength_overall_home,
      strength_overall_away = excluded.strength_overall_away,
      strength_attack_home  = excluded.strength_attack_home,
      strength_attack_away  = excluded.strength_attack_away,
      strength_defence_home = excluded.strength_defence_home,
      strength_defence_away = excluded.strength_defence_away,
      updated_at            = now()
  `;

  const teamIds = await fetchIdMap(db, "teams", "fpl_id", seasonId);
  return { result: { table: "teams", rows: rows.length }, teamIds };
}

export async function loadPlayers(
  db: Db,
  ctx: Pick<LoadContext, "db" | "seasonId" | "teamIds">,
  bootstrap: BootstrapStatic,
): Promise<{ result: LoadResult; playerIds: Map<number, number> }> {
  const rows = bootstrap.elements.map((e) => {
    const teamId = ctx.teamIds.get(e.team);
    if (teamId === undefined) throw new Error(`Unknown FPL team id ${e.team} for ${e.web_name}`);
    return {
      season_id: ctx.seasonId,
      fpl_id: e.id,
      fpl_code: e.code,
      team_id: teamId,
      web_name: e.web_name,
      first_name: e.first_name,
      second_name: e.second_name,
      element_type: e.element_type,
    };
  });

  for (const batch of chunk(rows)) {
    await db`
      insert into core.players ${db(
        batch,
        "season_id", "fpl_id", "fpl_code", "team_id",
        "web_name", "first_name", "second_name", "element_type",
      )}
      on conflict (season_id, fpl_id) do update set
        fpl_code     = excluded.fpl_code,
        team_id      = excluded.team_id,
        web_name     = excluded.web_name,
        first_name   = excluded.first_name,
        second_name  = excluded.second_name,
        element_type = excluded.element_type,
        updated_at   = now()
    `;
  }

  const playerIds = await fetchIdMap(db, "players", "fpl_id", ctx.seasonId);
  return { result: { table: "players", rows: rows.length }, playerIds };
}

export async function loadGameweeks(
  db: Db,
  seasonId: number,
  bootstrap: BootstrapStatic,
): Promise<{ result: LoadResult; gameweekIds: Map<number, number> }> {
  const rows = bootstrap.events.map((e) => ({
    season_id: seasonId,
    fpl_event_id: e.id,
    name: e.name,
    deadline_utc: e.deadline_time,
    finished: e.finished,
    data_checked: e.data_checked,
    is_current: e.is_current,
    is_next: e.is_next,
    is_previous: e.is_previous,
    average_entry_score: e.average_entry_score,
  }));

  await db`
    insert into core.gameweeks ${db(
      rows,
      "season_id", "fpl_event_id", "name", "deadline_utc", "finished",
      "data_checked", "is_current", "is_next", "is_previous", "average_entry_score",
    )}
    on conflict (season_id, fpl_event_id) do update set
      name                = excluded.name,
      deadline_utc        = excluded.deadline_utc,
      finished            = excluded.finished,
      data_checked        = excluded.data_checked,
      is_current          = excluded.is_current,
      is_next             = excluded.is_next,
      is_previous         = excluded.is_previous,
      average_entry_score = excluded.average_entry_score,
      updated_at          = now()
  `;

  const gameweekIds = await fetchIdMap(db, "gameweeks", "fpl_event_id", seasonId);
  return { result: { table: "gameweeks", rows: rows.length }, gameweekIds };
}

export async function loadFixtures(
  ctx: LoadContext,
  fixtures: readonly Fixture[],
  dryRun = false,
): Promise<LoadResult> {
  const rows = fixtures.map((f) => {
    const home = ctx.teamIds.get(f.team_h);
    const away = ctx.teamIds.get(f.team_a);
    if (home === undefined || away === undefined) {
      throw new Error(`Fixture ${f.id} references an unknown team`);
    }
    return {
      season_id: ctx.seasonId,
      fpl_fixture_id: f.id,
      // Null for a postponed fixture with no gameweek yet.
      gameweek_id: f.event === null ? null : (ctx.gameweekIds.get(f.event) ?? null),
      team_h_id: home,
      team_a_id: away,
      team_h_difficulty: f.team_h_difficulty,
      team_a_difficulty: f.team_a_difficulty,
      team_h_score: f.team_h_score,
      team_a_score: f.team_a_score,
      kickoff_utc: f.kickoff_time,
      started: f.started ?? false,
      finished: f.finished,
      minutes: f.minutes,
    };
  });

  if (dryRun) return { table: "fixtures", rows: rows.length };

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.fixtures ${ctx.db(
        batch,
        "season_id", "fpl_fixture_id", "gameweek_id", "team_h_id", "team_a_id",
        "team_h_difficulty", "team_a_difficulty", "team_h_score", "team_a_score",
        "kickoff_utc", "started", "finished", "minutes",
      )}
      on conflict (season_id, fpl_fixture_id) do update set
        gameweek_id       = excluded.gameweek_id,
        team_h_difficulty = excluded.team_h_difficulty,
        team_a_difficulty = excluded.team_a_difficulty,
        team_h_score      = excluded.team_h_score,
        team_a_score      = excluded.team_a_score,
        kickoff_utc       = excluded.kickoff_utc,
        started           = excluded.started,
        finished          = excluded.finished,
        minutes           = excluded.minutes,
        updated_at        = now()
    `;
  }

  return { table: "fixtures", rows: rows.length };
}

async function fetchIdMap(
  db: Db,
  table: "teams" | "players" | "gameweeks",
  naturalKey: "fpl_id" | "fpl_event_id",
  seasonId: number,
): Promise<Map<number, number>> {
  const rows = await db<{ id: string; key: number }[]>`
    select id, ${db(naturalKey)} as key
    from ${db(`core.${table}`)}
    where season_id = ${seasonId}
  `;
  return new Map(rows.map((r) => [Number(r.key), Number(r.id)]));
}
