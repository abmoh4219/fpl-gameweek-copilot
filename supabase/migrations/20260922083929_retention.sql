-- Retention for price_observations.
--
-- This is not housekeeping, it is a hard requirement: at one row per player
-- per run, the raw table would outgrow the 500 MB free tier inside a season.
-- Dedup (insert only on change) plus this 60-day window keeps it flat.
--
-- Summary rows are kept forever so we can still learn how price momentum
-- turns into real price changes long after the raw rows are gone.

create table core.price_observation_daily (
  id                       bigint generated always as identity primary key,
  player_id                bigint not null references core.players (id) on delete cascade,
  observed_on              date not null,
  observations             integer not null,
  -- price at the first and last observation of the day, in tenths
  open_cost                smallint not null,
  close_cost               smallint not null,
  -- price_change_percent: signed, so keep both extremes and where it closed
  min_percent              real,
  max_percent              real,
  close_percent            real,
  -- hourly rate: magnitude for ranking, signed extremes for learning how
  -- momentum behaves across a day (docs/data-dictionary.md, open question 2)
  peak_rate_magnitude      integer,
  min_rate                 integer,
  max_rate                 integer,
  close_rate               integer,
  -- largest absolute likelihood seen across the day's projections
  strongest_likelihood     smallint,
  was_locked               boolean not null default false,
  was_calibrating          boolean not null default false,
  -- did a confirmed price change actually land that day?
  price_changed            boolean not null default false,
  created_at               timestamptz not null default now(),
  unique (player_id, observed_on)
);
create index price_observation_daily_date_idx
  on core.price_observation_daily (observed_on);

alter table core.price_observation_daily enable row level security;

comment on table core.price_observation_daily is
  'Permanent daily rollup of price_observations. Raw rows are pruned after 60 days; these are kept forever.';

-- Summarise one day, then (optionally) drop raw rows older than the window.
-- Idempotent: re-running for the same day overwrites the summary.
create or replace function core.prune_price_observations(
  retain_days integer default 60
)
returns table (summarised_days integer, deleted_rows bigint)
language plpgsql
security definer
set search_path = core, pg_catalog
as $$
declare
  cutoff         date;
  days_done      integer := 0;
  rows_deleted   bigint  := 0;
begin
  cutoff := (now() at time zone 'utc')::date - retain_days;

  -- Roll up every day that is about to fall out of the raw window.
  with daily as (
    select
      o.player_id,
      (o.observed_at at time zone 'utc')::date as observed_on,
      count(*)::int                            as observations,
      (array_agg(o.now_cost order by o.observed_at))[1]                as open_cost,
      (array_agg(o.now_cost order by o.observed_at desc))[1]           as close_cost,
      min(o.price_change_percent)                                     as min_percent,
      max(o.price_change_percent)                                     as max_percent,
      (array_agg(o.price_change_percent order by o.observed_at desc))[1] as close_percent,
      max(abs(o.price_change_hourly_rate))                            as peak_rate_magnitude,
      min(o.price_change_hourly_rate)                                 as min_rate,
      max(o.price_change_hourly_rate)                                 as max_rate,
      (array_agg(o.price_change_hourly_rate order by o.observed_at desc))[1] as close_rate,
      bool_or(o.price_change_locked_until is not null)                as was_locked,
      bool_or(coalesce(o.price_change_calibrating, false))            as was_calibrating,
      min(o.now_cost) <> max(o.now_cost)                              as price_changed
    from core.price_observations o
    where (o.observed_at at time zone 'utc')::date < cutoff
    group by o.player_id, (o.observed_at at time zone 'utc')::date
  )
  insert into core.price_observation_daily (
    player_id, observed_on, observations, open_cost, close_cost,
    min_percent, max_percent, close_percent, peak_rate_magnitude,
    min_rate, max_rate, close_rate,
    was_locked, was_calibrating, price_changed
  )
  select
    player_id, observed_on, observations, open_cost, close_cost,
    min_percent, max_percent, close_percent, peak_rate_magnitude,
    min_rate, max_rate, close_rate,
    was_locked, was_calibrating, price_changed
  from daily
  on conflict (player_id, observed_on) do update set
    observations         = excluded.observations,
    open_cost            = excluded.open_cost,
    close_cost           = excluded.close_cost,
    min_percent          = excluded.min_percent,
    max_percent          = excluded.max_percent,
    close_percent        = excluded.close_percent,
    peak_rate_magnitude  = excluded.peak_rate_magnitude,
    min_rate             = excluded.min_rate,
    max_rate             = excluded.max_rate,
    close_rate           = excluded.close_rate,
    was_locked           = excluded.was_locked,
    was_calibrating      = excluded.was_calibrating,
    price_changed        = excluded.price_changed;

  get diagnostics days_done = row_count;

  -- Only now is it safe to drop the raw rows.
  delete from core.price_observations o
  where (o.observed_at at time zone 'utc')::date < cutoff;

  get diagnostics rows_deleted = row_count;

  return query select days_done, rows_deleted;
end;
$$;

revoke all on function core.prune_price_observations(integer) from public, anon, authenticated;

comment on function core.prune_price_observations(integer) is
  'Summarise then delete price_observations older than retain_days. Called by the daily sync job in Phase 3.';
