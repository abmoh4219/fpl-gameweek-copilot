-- Public read-only views for the website.
--
-- These are OWNER-PRIVILEGED views (security_invoker off, the PostgreSQL
-- default): they read core as their owner, so `anon` needs no privileges on
-- core at all. Each view below is therefore an explicit ALLOW-LIST of the
-- columns we are willing to publish.
--
-- Supabase's Security Advisor flags these as "security definer view". That
-- finding is DELIBERATE and accepted — see docs/database.md. These api views
-- are the only advisor findings we accept; anything else must be fixed.
--
-- When user-scoped tables arrive (waitlist, auth, plans, rate limits), they
-- get RLS policies and security_invoker views instead. Public football data
-- and per-user data never share a security model.

create view api.player_current as
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
  penalties_order, corners_and_indirect_freekicks_order, direct_freekicks_order
from core.player_current;

create view api.player_form as
select
  pf.player_id,
  p.fpl_id,
  p.web_name,
  gameweeks_last_4, points_last_4, minutes_last_4, starts_last_4,
  xg_last_4, xa_last_4, xgi_last_4, xgi_per_90_last_4,
  gameweeks_last_6, points_last_6, minutes_last_6, starts_last_6,
  xg_last_6, xa_last_6, xgi_last_6, xgi_per_90_last_6
from core.player_form pf
join core.players p on p.id = pf.player_id;

create view api.fixture_ticker as
select
  team_fpl_id, team_name, team_short_name,
  gameweek, gw_offset, deadline_utc,
  kickoff_utc, is_home, opponent_short_name, difficulty,
  is_blank, is_double
from core.fixture_ticker;

create view api.price_changes_daily as
select
  player_id, fpl_id, web_name, element_type, team_short_name,
  changed_on, previous_date, change_tenths, change_m, price_m, direction
from core.price_changes_daily;

create view api.price_watch as
select
  player_id, fpl_id, web_name, element_type, team_short_name,
  observed_at, price_m,
  price_change_percent, hourly_rate, hourly_rate_magnitude, direction, momentum,
  strongest_likelihood, strongest_offset,
  is_locked, is_calibrating
from core.price_watch;

create view api.cl_congestion as
select
  fixture_id, gameweek, team_fpl_id, team_short_name,
  kickoff_utc, is_home,
  previous_cl_utc, previous_cl_opponent, next_cl_utc, next_cl_opponent,
  hours_since_cl, days_since_cl, hours_until_cl, days_until_cl,
  is_after_cl, is_before_cl
from core.cl_congestion;

-- Read-only, and granted one view at a time — never a blanket grant.
grant select on api.player_current      to anon, authenticated;
grant select on api.player_form         to anon, authenticated;
grant select on api.fixture_ticker      to anon, authenticated;
grant select on api.price_changes_daily to anon, authenticated;
grant select on api.price_watch         to anon, authenticated;
grant select on api.cl_congestion       to anon, authenticated;

comment on view api.price_watch is
  'ESTIMATES ONLY. Direction comes from the sign of price_change_percent. hourly_rate keeps its sign as momentum, and the momentum column ("with" / "against") is EXPERIMENTAL — a hypothesis under observation, not a signal to act on.';
comment on view api.cl_congestion is
  'Champions League games only — the free football-data tier excludes the Europa League, Conference League and domestic cups.';
