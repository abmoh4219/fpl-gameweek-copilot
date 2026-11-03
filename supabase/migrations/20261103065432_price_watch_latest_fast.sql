-- core.price_watch timed out in the cloud (Supabase statement timeout for
-- anon, error 57014) once price_observations held weeks of history: its
-- `distinct on (player_id) ... order by player_id, observed_at desc` sorted
-- the whole table to keep one row per player.
--
-- Same view, same columns in the same order, same values: "latest" now takes
-- each player's newest observation with one backward scan of the existing
-- unique index (player_id, observed_at). Cost grows with the number of
-- players, not with history. Grants on api.price_watch are unchanged.

create or replace view core.price_watch as
with latest as (
  -- One index lookup per player on (player_id, observed_at), newest first,
  -- instead of sorting every observation ever stored.
  select
    p.id as player_id,
    o.observed_at,
    o.now_cost,
    o.price_change_percent,
    o.price_change_hourly_rate,
    o.price_change_projections,
    o.price_change_locked_until,
    o.price_change_calibrating
  from core.players p
  cross join lateral (
    select *
    from core.price_observations o
    where o.player_id = p.id
    order by o.observed_at desc
    limit 1
  ) o
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

-- core.price_changes_daily had the same shape of problem, growing more slowly:
-- lag() over every snapshot of the season ran before any date filter, so
-- "changes on one night" still read the whole season. Same columns, same
-- values: a date filter now reaches player_snapshots (its snapshot_date index)
-- and each remaining row looks up only its own previous snapshot.
create or replace view core.price_changes_daily as
select
  s.player_id,
  p.fpl_id,
  p.web_name,
  p.element_type,
  t.short_name                                     as team_short_name,
  s.snapshot_date                                  as changed_on,
  prev.snapshot_date                               as previous_date,
  prev.now_cost                                    as previous_cost,
  s.now_cost,
  (s.now_cost - prev.now_cost)::int                as change_tenths,
  round((s.now_cost - prev.now_cost) / 10.0, 1)::real as change_m,
  round(s.now_cost / 10.0, 1)::real                as price_m,
  case when s.now_cost > prev.now_cost then 'rise' else 'fall' end as direction
from core.player_snapshots s
cross join lateral (
  select s2.snapshot_date, s2.now_cost
  from core.player_snapshots s2
  where s2.player_id = s.player_id
    and s2.snapshot_date < s.snapshot_date
  order by s2.snapshot_date desc
  limit 1
) prev
join core.players p on p.id = s.player_id
join core.teams t on t.id = p.team_id
where s.now_cost <> prev.now_cost;
