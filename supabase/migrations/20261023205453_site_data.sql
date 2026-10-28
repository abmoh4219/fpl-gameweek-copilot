-- Site data: what the website renders, published by the jobs (ADR-0008).
--
-- The insight engine runs in jobs/, never in the website: price-sync and
-- daily-sync compute every player card and every team's fixture run and
-- upsert them here, one statement per table. The site only reads. That keeps
-- "code computes every number" in one place — the site and Telegram can never
-- disagree — and means no visitor ever triggers a computation.
--
-- One row per player and per team, overwritten each run: the live set is
-- ~700 small JSON documents, about 1 MB, and it does not grow.

create table core.player_cards (
  player_id   bigint primary key references core.players (id) on delete cascade,
  card        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table core.team_runs (
  team_id     bigint primary key references core.teams (id) on delete cascade,
  run         jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table core.player_cards enable row level security;
alter table core.team_runs    enable row level security;

comment on table core.player_cards is
  'Latest computed PlayerCard per player (packages/shared insight engine). Written by jobs, read through api.player_cards.';
comment on table core.team_runs is
  'Latest 3- and 5-gameweek fixture run per team. Written by jobs, read through api.team_runs.';

-- Owner-privileged views, the same pattern as every other api view: anon needs
-- no privileges on core, and each definition is the allow-list of what we
-- publish. Current season only — FPL reassigns every id each season.

create view api.player_cards as
select
  p.fpl_id,
  p.web_name,
  t.short_name as team_short_name,
  c.card,
  c.updated_at
from core.player_cards c
join core.players p on p.id = c.player_id
join core.teams t   on t.id = p.team_id
join core.seasons s on s.id = p.season_id and s.is_current;

create view api.team_runs as
select
  t.fpl_id as team_fpl_id,
  t.name   as team_name,
  t.short_name as team_short_name,
  r.run,
  r.updated_at
from core.team_runs r
join core.teams t   on t.id = r.team_id
join core.seasons s on s.id = t.season_id and s.is_current;

-- Every stored preview, for /previews/[gw]. api.latest_reports only serves
-- the newest of each type.
create view api.previews as
select gameweek, report_date, payload, generated_by, created_at, updated_at
from core.reports
where report_type = 'preview';

grant select on api.player_cards to anon, authenticated;
grant select on api.team_runs    to anon, authenticated;
grant select on api.previews     to anon, authenticated;

comment on view api.player_cards is
  'Computed player cards. Forward-looking fields (fixtures, goal threat) are ESTIMATES.';
comment on view api.previews is
  'Every gameweek preview. payload.prose, when present, is AI-written and was validated by code before storage (ADR-0007).';
