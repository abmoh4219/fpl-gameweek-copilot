-- The stats hub (/stats): season leaderboards for goals, assists, clean
-- sheets, bonus, BPS, ICT and expected stats per 90.
--
-- These columns already arrive in every daily snapshot; this only publishes
-- them. Extending api.player_current (rather than adding a view) keeps the
-- Security Advisor at its ten accepted owner-privileged api views
-- (CLAUDE.md §4a). New columns go last, as PostgreSQL requires when replacing
-- a view; existing grants are kept.

create or replace view core.player_current as
select distinct on (p.id)
  p.id                                    as player_id,
  p.fpl_id,
  p.web_name,
  p.element_type,
  t.id                                    as team_id,
  t.fpl_id                                as team_fpl_id,
  t.name                                  as team_name,
  t.short_name                            as team_short_name,
  s.snapshot_date,
  s.now_cost,
  round(s.now_cost / 10.0, 1)::real       as price_m,
  s.cost_change_event,
  s.cost_change_start,
  s.status,
  s.news,
  s.news_added,
  s.chance_of_playing_next_round,
  s.selected_by_percent,
  s.transfers_in_event,
  s.transfers_out_event,
  s.transfers_in_event - s.transfers_out_event as net_transfers_event,
  s.total_points,
  s.event_points,
  s.form,
  s.points_per_game,
  s.ep_next,
  s.minutes,
  s.starts,
  s.expected_goals,
  s.expected_assists,
  s.expected_goal_involvements,
  s.expected_goal_involvements_per_90,
  s.expected_goals_conceded,
  s.defensive_contribution,
  s.defensive_contribution_per_90,
  s.penalties_order,
  s.corners_and_indirect_freekicks_order,
  s.direct_freekicks_order,
  -- appended for the stats hub (a replaced view may only add columns at the end)
  s.goals_scored,
  s.assists,
  s.clean_sheets,
  s.goals_conceded,
  s.bonus,
  s.bps,
  s.ict_index,
  s.expected_goals_per_90,
  s.expected_assists_per_90,
  t.fpl_code                              as team_code
from core.players p
join core.teams t on t.id = p.team_id
join core.player_snapshots s on s.player_id = p.id
order by p.id, s.snapshot_date desc;


create or replace view api.player_current as
select
  player_id, fpl_id, web_name, element_type,
  team_fpl_id, team_name, team_short_name,
  snapshot_date, price_m, cost_change_event, cost_change_start,
  status, news, chance_of_playing_next_round,
  selected_by_percent, net_transfers_event,
  total_points, event_points, form, points_per_game, ep_next,
  minutes, starts,
  expected_goals, expected_assists, expected_goal_involvements,
  expected_goal_involvements_per_90, expected_goals_conceded,
  defensive_contribution, defensive_contribution_per_90,
  penalties_order, corners_and_indirect_freekicks_order, direct_freekicks_order,
  goals_scored, assists, clean_sheets, goals_conceded, bonus, bps, ict_index,
  expected_goals_per_90, expected_assists_per_90, team_code
from core.player_current;
