-- Job-facing views. The api schema mirrors the web-facing ones.
-- Every number is computed here or in packages/shared — never by the AI step.

-- ---------------------------------------------------------- player_current --
-- DISTINCT ON keeps the newest snapshot per player in one index-ordered pass,
-- which beats a correlated max(snapshot_date) subquery on a table that grows
-- by ~667 rows a day.
create view core.player_current as
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
  s.direct_freekicks_order
from core.players p
join core.teams t on t.id = p.team_id
join core.player_snapshots s on s.player_id = p.id
order by p.id, s.snapshot_date desc;

comment on view core.player_current is
  'Latest daily snapshot per player, joined to player and team. Price exposed both in tenths and in GBP m.';

-- ------------------------------------------------------------- player_form --
-- row_number() ranks each player's finished gameweeks by recency, then
-- aggregate FILTERs read the last 4 and last 6 out of the same single scan
-- rather than joining the table to itself twice.
create view core.player_form as
with ranked as (
  select
    pgs.player_id,
    pgs.total_points,
    pgs.minutes,
    pgs.starts,
    pgs.expected_goals,
    pgs.expected_assists,
    pgs.expected_goal_involvements,
    row_number() over (
      partition by pgs.player_id
      order by g.fpl_event_id desc
    ) as recency
  from core.player_gameweek_stats pgs
  join core.gameweeks g on g.id = pgs.gameweek_id
  where g.finished
)
select
  player_id,
  count(*) filter (where recency <= 4)::int                            as gameweeks_last_4,
  coalesce(sum(total_points) filter (where recency <= 4), 0)::int       as points_last_4,
  coalesce(sum(minutes) filter (where recency <= 4), 0)::int            as minutes_last_4,
  coalesce(sum(starts) filter (where recency <= 4), 0)::int             as starts_last_4,
  coalesce(sum(expected_goals) filter (where recency <= 4), 0)::real    as xg_last_4,
  coalesce(sum(expected_assists) filter (where recency <= 4), 0)::real  as xa_last_4,
  coalesce(sum(expected_goal_involvements) filter (where recency <= 4), 0)::real as xgi_last_4,
  case
    when coalesce(sum(minutes) filter (where recency <= 4), 0) > 0
    then (sum(expected_goal_involvements) filter (where recency <= 4)
          / sum(minutes) filter (where recency <= 4) * 90)::real
    else 0::real
  end                                                                  as xgi_per_90_last_4,
  count(*) filter (where recency <= 6)::int                            as gameweeks_last_6,
  coalesce(sum(total_points) filter (where recency <= 6), 0)::int       as points_last_6,
  coalesce(sum(minutes) filter (where recency <= 6), 0)::int            as minutes_last_6,
  coalesce(sum(starts) filter (where recency <= 6), 0)::int             as starts_last_6,
  coalesce(sum(expected_goals) filter (where recency <= 6), 0)::real    as xg_last_6,
  coalesce(sum(expected_assists) filter (where recency <= 6), 0)::real  as xa_last_6,
  coalesce(sum(expected_goal_involvements) filter (where recency <= 6), 0)::real as xgi_last_6,
  case
    when coalesce(sum(minutes) filter (where recency <= 6), 0) > 0
    then (sum(expected_goal_involvements) filter (where recency <= 6)
          / sum(minutes) filter (where recency <= 6) * 90)::real
    else 0::real
  end                                                                  as xgi_per_90_last_6
from ranked
where recency <= 6
group by player_id;

comment on view core.player_form is
  'Rolling form over the last 4 and 6 FINISHED gameweeks. Blank gameweeks simply do not contribute rows.';

-- ---------------------------------------------------------- fixture_ticker --
-- teams CROSS JOIN the next 5 unfinished gameweeks, LEFT JOINed to fixtures:
-- the left join is what makes blanks visible (a row with no fixture) and
-- doubles natural (two rows for the same team and gameweek).
create view core.fixture_ticker as
with horizon as (
  select
    id,
    season_id,
    fpl_event_id,
    deadline_utc,
    row_number() over (partition by season_id order by fpl_event_id) as gw_offset
  from core.gameweeks
  where not finished
)
select
  t.id                                     as team_id,
  t.fpl_id                                 as team_fpl_id,
  t.name                                   as team_name,
  t.short_name                             as team_short_name,
  h.fpl_event_id                           as gameweek,
  h.gw_offset::int,
  h.deadline_utc,
  f.id                                     as fixture_id,
  f.kickoff_utc,
  case when f.id is null then null else (f.team_h_id = t.id) end as is_home,
  opp.id                                   as opponent_team_id,
  opp.short_name                           as opponent_short_name,
  case
    when f.id is null then null
    when f.team_h_id = t.id then f.team_h_difficulty
    else f.team_a_difficulty
  end                                      as difficulty,
  (f.id is null)                           as is_blank,
  (count(f.id) over (partition by t.id, h.id) > 1) as is_double
from core.teams t
join horizon h
  on h.season_id = t.season_id
 and h.gw_offset <= 5
left join core.fixtures f
  on f.gameweek_id = h.id
 and (f.team_h_id = t.id or f.team_a_id = t.id)
left join core.teams opp
  on opp.id = case when f.team_h_id = t.id then f.team_a_id else f.team_h_id end;

comment on view core.fixture_ticker is
  'Next 5 unfinished gameweeks per team. is_blank marks a gameweek with no fixture, is_double a gameweek with more than one.';

-- ------------------------------------------------------ price_changes_daily --
-- LAG compares each snapshot to that player's previous one, so a change is
-- only reported when the price actually moved between consecutive days.
-- These are CONFIRMED changes, never projections.
create view core.price_changes_daily as
with deltas as (
  select
    s.player_id,
    s.snapshot_date,
    s.now_cost,
    lag(s.now_cost)      over (partition by s.player_id order by s.snapshot_date) as previous_cost,
    lag(s.snapshot_date) over (partition by s.player_id order by s.snapshot_date) as previous_date
  from core.player_snapshots s
)
select
  d.player_id,
  p.fpl_id,
  p.web_name,
  p.element_type,
  t.short_name                                     as team_short_name,
  d.snapshot_date                                  as changed_on,
  d.previous_date,
  d.previous_cost,
  d.now_cost,
  (d.now_cost - d.previous_cost)::int              as change_tenths,
  round((d.now_cost - d.previous_cost) / 10.0, 1)::real as change_m,
  round(d.now_cost / 10.0, 1)::real                as price_m,
  case when d.now_cost > d.previous_cost then 'rise' else 'fall' end as direction
from deltas d
join core.players p on p.id = d.player_id
join core.teams t on t.id = p.team_id
where d.previous_cost is not null
  and d.now_cost <> d.previous_cost;

comment on view core.price_changes_daily is
  'Confirmed price changes between consecutive daily snapshots. Not projections — see price_watch for those.';

-- ------------------------------------------------------------- price_watch --
-- Latest observation per player.
--
-- DIRECTION comes ONLY from the sign of price_change_percent. That rule is
-- unchanged. The hourly rate keeps its sign as well, because discarding it
-- throws away information: the working hypothesis is that percent is the
-- POSITION toward a change and rate is the CURRENT MOMENTUM, so the two can
-- legitimately disagree when a move is reversing.
--
-- `momentum` labels that agreement and is EXPERIMENTAL: it is a hypothesis to
-- be confirmed by observation, not a signal to act on
-- (docs/data-dictionary.md, open question 2).
create view core.price_watch as
with latest as (
  select distinct on (o.player_id)
    o.player_id,
    o.observed_at,
    o.now_cost,
    o.price_change_percent,
    o.price_change_hourly_rate,
    o.price_change_projections,
    o.price_change_locked_until,
    o.price_change_calibrating
  from core.price_observations o
  order by o.player_id, o.observed_at desc
)
select
  l.player_id,
  p.fpl_id,
  p.web_name,
  p.element_type,
  t.short_name                              as team_short_name,
  l.observed_at,
  l.now_cost,
  round(l.now_cost / 10.0, 1)::real         as price_m,
  l.price_change_percent,
  -- Signed: momentum, not direction.
  l.price_change_hourly_rate                as hourly_rate,
  abs(l.price_change_hourly_rate)           as hourly_rate_magnitude,
  case
    when l.price_change_percent is null then 'unknown'
    when l.price_change_percent > 0     then 'rising'
    when l.price_change_percent < 0     then 'falling'
    else 'stable'
  end                                       as direction,
  -- EXPERIMENTAL. 'with'    = momentum pushing further toward the change
  --               'against' = momentum pushing back against it
  --               null      = no signal (either value zero or missing)
  case
    when l.price_change_percent is null or l.price_change_hourly_rate is null then null
    when l.price_change_percent = 0 or l.price_change_hourly_rate = 0 then null
    when sign(l.price_change_percent) = sign(l.price_change_hourly_rate::real) then 'with'
    else 'against'
  end                                       as momentum,
  strongest.likelihood                      as strongest_likelihood,
  strongest.offset_days                     as strongest_offset,
  l.price_change_locked_until,
  (l.price_change_locked_until is not null
     and l.price_change_locked_until > now()) as is_locked,
  coalesce(l.price_change_calibrating, false) as is_calibrating
from latest l
join core.players p on p.id = l.player_id
join core.teams t on t.id = p.team_id
-- The projection with the largest absolute likelihood; ties break on the
-- nearest offset. LATERAL keeps this to one jsonb expansion per player.
left join lateral (
  select
    (proj ->> 'likelihood')::smallint as likelihood,
    (proj ->> 'offset')::smallint     as offset_days
  from jsonb_array_elements(coalesce(l.price_change_projections, '[]'::jsonb)) as proj
  order by abs((proj ->> 'likelihood')::int) desc, (proj ->> 'offset')::int
  limit 1
) strongest on true;

comment on view core.price_watch is
  'Latest price telemetry per player. ESTIMATES ONLY: percent can exceed 100 without a change landing. Direction comes only from price_change_percent; hourly_rate is signed momentum and the momentum column is EXPERIMENTAL.';

-- ----------------------------------------------------------- cl_congestion --
-- One row per upcoming Premier League fixture PER CLUB involved, for clubs
-- that play in the Champions League. Two lateral lookups find that club's
-- nearest CL match either side of the kickoff, so the flag covers both a
-- midweek game just gone and one coming up.
--
-- Champions League only: the football-data free tier does not include the
-- Europa League, Conference League or domestic cups.
create view core.cl_congestion as
select
  f.id                                   as fixture_id,
  g.fpl_event_id                         as gameweek,
  t.id                                   as team_id,
  t.fpl_id                               as team_fpl_id,
  t.short_name                           as team_short_name,
  f.kickoff_utc,
  (f.team_h_id = t.id)                   as is_home,
  prev_cl.match_utc                      as previous_cl_utc,
  prev_cl.opponent_name                  as previous_cl_opponent,
  next_cl.match_utc                      as next_cl_utc,
  next_cl.opponent_name                  as next_cl_opponent,
  round((extract(epoch from (f.kickoff_utc - prev_cl.match_utc)) / 3600.0)::numeric, 1) as hours_since_cl,
  round((extract(epoch from (f.kickoff_utc - prev_cl.match_utc)) / 86400.0)::numeric, 2) as days_since_cl,
  round((extract(epoch from (next_cl.match_utc - f.kickoff_utc)) / 3600.0)::numeric, 1)  as hours_until_cl,
  round((extract(epoch from (next_cl.match_utc - f.kickoff_utc)) / 86400.0)::numeric, 2) as days_until_cl,
  (prev_cl.match_utc is not null
     and f.kickoff_utc - prev_cl.match_utc < interval '4 days') as is_after_cl,
  (next_cl.match_utc is not null
     and next_cl.match_utc - f.kickoff_utc < interval '4 days') as is_before_cl
from core.fixtures f
join core.gameweeks g on g.id = f.gameweek_id
join core.teams t on t.id in (f.team_h_id, f.team_a_id)
left join lateral (
  select c.match_utc, c.opponent_name
  from core.cl_fixtures c
  where c.team_id = t.id
    and c.match_utc < f.kickoff_utc
  order by c.match_utc desc
  limit 1
) prev_cl on true
left join lateral (
  select c.match_utc, c.opponent_name
  from core.cl_fixtures c
  where c.team_id = t.id
    and c.match_utc > f.kickoff_utc
  order by c.match_utc asc
  limit 1
) next_cl on true
where f.kickoff_utc is not null
  and f.kickoff_utc >= now()
  and exists (select 1 from core.cl_fixtures c where c.team_id = t.id);

comment on view core.cl_congestion is
  'Fixture congestion for Champions League clubs only. is_after_cl / is_before_cl flag a PL game within ~4 days of a CL match.';
