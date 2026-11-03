-- Player pages (/players/[id]): one row per player per gameweek of the
-- current season, with FPL's own points breakdown.
--
-- Public football data, so the same pattern as the other api views: an
-- owner-privileged view whose column list is the allow-list (CLAUDE.md §4a).
-- This is the eleventh accepted "Security Definer View" finding.
--
-- points_breakdown sums FPL's per-fixture "explain" (stored in
-- fixture_detail) by stat: {"minutes": 2, "goals_scored": 8, "bonus": 3, ...}.
-- A double gameweek's two fixtures are added together.

create view api.player_gameweeks as
select
  p.fpl_id,
  g.fpl_event_id                      as gameweek,
  s.minutes,
  s.total_points,
  s.goals_scored,
  s.assists,
  s.clean_sheets,
  s.goals_conceded,
  s.bonus,
  s.bps,
  s.saves,
  s.yellow_cards,
  s.red_cards,
  s.defensive_contribution,
  s.expected_goals,
  s.expected_assists,
  s.expected_goal_involvements,
  breakdown.points_breakdown
from core.player_gameweek_stats s
join core.players p   on p.id = s.player_id
join core.gameweeks g on g.id = s.gameweek_id
join core.seasons se  on se.id = g.season_id and se.is_current
left join lateral (
  select coalesce(jsonb_object_agg(identifier, points), '{}'::jsonb) as points_breakdown
  from (
    select st ->> 'identifier' as identifier, sum((st ->> 'points')::int) as points
    from jsonb_array_elements(coalesce(s.fixture_detail, '[]'::jsonb)) as fx,
         jsonb_array_elements(coalesce(fx -> 'stats', '[]'::jsonb)) as st
    group by 1
  ) per_stat
) breakdown on true;

comment on view api.player_gameweeks is
  'One row per player per current-season gameweek, with FPL''s points breakdown summed by stat. Read by the player pages.';

-- Read-only, and granted one view at a time.
grant select on api.player_gameweeks to anon, authenticated;
