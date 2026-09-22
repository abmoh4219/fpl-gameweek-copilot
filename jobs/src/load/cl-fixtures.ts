import type { FootballDataMatches } from "@fpl/shared";
import { toFplId } from "@fpl/shared";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Champions League matches involving Premier League clubs.
 *
 * Which clubs those are is DERIVED from the team map, never hardcoded. A match
 * between two PL clubs produces two rows, one per club's perspective — which
 * is why the unique key is (match id, team), not match id alone.
 *
 * Optional data: a caller that fails to fetch this must still finish the run
 * (CLAUDE.md §10).
 */
export async function loadClFixtures(
  ctx: LoadContext,
  matches: FootballDataMatches,
  dryRun = false,
): Promise<LoadResult> {
  const rows = matches.matches.flatMap((match) => {
    const sides = [
      { team: match.homeTeam, opponent: match.awayTeam, isHome: true },
      { team: match.awayTeam, opponent: match.homeTeam, isHome: false },
    ];

    return sides.flatMap(({ team, opponent, isHome }) => {
      const fplTeamId = toFplId(team.id);
      if (fplTeamId === undefined) return []; // not a Premier League club
      const teamId = ctx.teamIds.get(fplTeamId);
      if (teamId === undefined) return [];
      return [
        {
          season_id: ctx.seasonId,
          football_data_match_id: match.id,
          team_id: teamId,
          opponent_football_data_id: opponent.id,
          opponent_name: opponent.shortName ?? opponent.name ?? String(opponent.id),
          is_home: isHome,
          match_utc: match.utcDate,
          status: match.status,
          stage: match.stage,
          matchday: match.matchday,
        },
      ];
    });
  });

  if (dryRun) return { table: "cl_fixtures", rows: rows.length };

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.cl_fixtures ${ctx.db(
        batch,
        "season_id", "football_data_match_id", "team_id",
        "opponent_football_data_id", "opponent_name", "is_home",
        "match_utc", "status", "stage", "matchday",
      )}
      on conflict (football_data_match_id, team_id) do update set
        opponent_football_data_id = excluded.opponent_football_data_id,
        opponent_name             = excluded.opponent_name,
        is_home                   = excluded.is_home,
        match_utc                 = excluded.match_utc,
        status                    = excluded.status,
        stage                     = excluded.stage,
        matchday                  = excluded.matchday,
        synced_at                 = now()
    `;
  }

  return { table: "cl_fixtures", rows: rows.length };
}
