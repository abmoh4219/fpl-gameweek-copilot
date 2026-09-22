-- Core tables. All season-scoped, all with a natural unique key that every
-- loader upserts on (ON CONFLICT), so re-running a load is a no-op.
--
-- Type rules (CLAUDE.md):
--   money      integer TENTHS (now_cost 55 = GBP 5.5m) — never float
--   statistics real (float4) — 7 significant digits is plenty for values FPL
--              publishes to 2dp, and it saves ~25% on the two largest tables
--
-- RLS is enabled on every table with NO policies: nothing reaches these rows
-- except the service role, which bypasses RLS.

-- ---------------------------------------------------------------- seasons --
create table core.seasons (
  id          bigint generated always as identity primary key,
  name        text not null unique,               -- '2026/27'
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table core.seasons is
  'One row per FPL season. Every ID in this database is season-scoped because FPL reassigns them each year.';

-- ------------------------------------------------------------------ teams --
create table core.teams (
  id                     bigint generated always as identity primary key,
  season_id              bigint not null references core.seasons (id) on delete cascade,
  fpl_id                 smallint not null,       -- bootstrap-static.teams[].id, 1-20
  fpl_code               integer not null,        -- stable across seasons
  name                   text not null,           -- 'Man City'
  short_name             text not null,           -- 'MCI'
  football_data_id       integer,                 -- the ONLY safe join key to football-data
  -- Null for all 20 teams in the 2026/27 sample; use the granular values below.
  strength               smallint,
  strength_overall_home  smallint not null,
  strength_overall_away  smallint not null,
  strength_attack_home   smallint not null,
  strength_attack_away   smallint not null,
  strength_defence_home  smallint not null,
  strength_defence_away  smallint not null,
  updated_at             timestamptz not null default now(),
  unique (season_id, fpl_id)
);
create unique index teams_season_football_data_id_key
  on core.teams (season_id, football_data_id)
  where football_data_id is not null;
comment on column core.teams.football_data_id is
  'football-data.org numeric team id. Never join on TLA: TLAs are not unique.';

-- ---------------------------------------------------------------- players --
create table core.players (
  id            bigint generated always as identity primary key,
  season_id     bigint not null references core.seasons (id) on delete cascade,
  fpl_id        integer not null,                 -- season-scoped
  fpl_code      integer not null,                 -- stable across seasons
  team_id       bigint not null references core.teams (id) on delete cascade,
  web_name      text not null,
  first_name    text not null,
  second_name   text not null,
  element_type  smallint not null check (element_type between 1 and 4),  -- 1 GKP 2 DEF 3 MID 4 FWD
  updated_at    timestamptz not null default now(),
  unique (season_id, fpl_id)
);
create index players_team_id_idx on core.players (team_id);

-- -------------------------------------------------------------- gameweeks --
create table core.gameweeks (
  id                   bigint generated always as identity primary key,
  season_id            bigint not null references core.seasons (id) on delete cascade,
  fpl_event_id         smallint not null check (fpl_event_id between 1 and 38),
  name                 text not null,
  deadline_utc         timestamptz not null,      -- always UTC; the UI shows UK local
  finished             boolean not null default false,
  data_checked         boolean not null default false,
  is_current           boolean not null default false,
  is_next              boolean not null default false,
  is_previous          boolean not null default false,
  average_entry_score  integer,
  updated_at           timestamptz not null default now(),
  unique (season_id, fpl_event_id)
);

-- --------------------------------------------------------------- fixtures --
create table core.fixtures (
  id                 bigint generated always as identity primary key,
  season_id          bigint not null references core.seasons (id) on delete cascade,
  fpl_fixture_id     integer not null,
  -- Nullable: a postponed fixture has no gameweek until it is rescheduled.
  gameweek_id        bigint references core.gameweeks (id) on delete set null,
  team_h_id          bigint not null references core.teams (id) on delete cascade,
  team_a_id          bigint not null references core.teams (id) on delete cascade,
  team_h_difficulty  smallint not null check (team_h_difficulty between 1 and 5),
  team_a_difficulty  smallint not null check (team_a_difficulty between 1 and 5),
  team_h_score       smallint,
  team_a_score       smallint,
  kickoff_utc        timestamptz,
  started            boolean not null default false,
  finished           boolean not null default false,
  minutes            smallint not null default 0,
  updated_at         timestamptz not null default now(),
  unique (season_id, fpl_fixture_id),
  check (team_h_id <> team_a_id)
);
create index fixtures_gameweek_id_idx on core.fixtures (gameweek_id);
create index fixtures_team_h_id_idx on core.fixtures (team_h_id);
create index fixtures_team_a_id_idx on core.fixtures (team_a_id);
create index fixtures_kickoff_utc_idx on core.fixtures (kickoff_utc);

-- ------------------------------------------------------------ cl_fixtures --
-- Champions League matches involving Premier League clubs, used ONLY to
-- compute the fixture congestion flag. One row PER PL CLUB per match: when two
-- PL clubs are drawn together, the match produces two rows.
create table core.cl_fixtures (
  id                         bigint generated always as identity primary key,
  season_id                  bigint not null references core.seasons (id) on delete cascade,
  football_data_match_id     integer not null,
  team_id                    bigint not null references core.teams (id) on delete cascade,
  opponent_football_data_id  integer not null,
  opponent_name              text not null,
  is_home                    boolean not null,
  match_utc                  timestamptz not null,
  status                     text not null,        -- SCHEDULED | TIMED | FINISHED | POSTPONED | ...
  stage                      text,                 -- LEAGUE_STAGE | PLAYOFFS | LAST_16 | ...
  matchday                   smallint,
  synced_at                  timestamptz not null default now(),
  unique (football_data_match_id, team_id)
);
create index cl_fixtures_team_match_idx on core.cl_fixtures (team_id, match_utc);
comment on table core.cl_fixtures is
  'Refreshed every run: knockout fixtures only appear after the league stage, so a cached season snapshot goes stale.';

-- ------------------------------------------------------- player_snapshots --
-- One row per player per day: the daily state of the world.
create table core.player_snapshots (
  id                                    bigint generated always as identity primary key,
  player_id                             bigint not null references core.players (id) on delete cascade,
  snapshot_date                         date not null,
  -- price, in tenths
  now_cost                              smallint not null,
  cost_change_event                     smallint not null default 0,
  cost_change_start                     smallint not null default 0,
  -- availability
  status                                text not null,
  news                                  text not null default '',
  news_added                            timestamptz,
  chance_of_playing_next_round          smallint,
  chance_of_playing_this_round          smallint,
  -- ownership and transfers
  selected_by_percent                   real not null,
  transfers_in_event                    integer not null default 0,
  transfers_out_event                   integer not null default 0,
  -- form and scoring
  total_points                          integer not null default 0,
  event_points                          integer not null default 0,
  form                                  real not null default 0,
  points_per_game                       real not null default 0,
  ep_next                               real not null default 0,
  bonus                                 smallint not null default 0,
  bps                                   integer not null default 0,
  -- minutes
  minutes                               integer not null default 0,
  starts                                smallint not null default 0,
  -- counting stats
  goals_scored                          smallint not null default 0,
  assists                               smallint not null default 0,
  clean_sheets                          smallint not null default 0,
  goals_conceded                        smallint not null default 0,
  defensive_contribution                integer not null default 0,
  defensive_contribution_per_90         real not null default 0,
  -- ICT
  influence                             real not null default 0,
  creativity                            real not null default 0,
  threat                                real not null default 0,
  ict_index                             real not null default 0,
  -- expected stats (season totals + per 90)
  expected_goals                        real not null default 0,
  expected_assists                      real not null default 0,
  expected_goal_involvements            real not null default 0,
  expected_goals_conceded               real not null default 0,
  expected_goals_per_90                 real not null default 0,
  expected_assists_per_90               real not null default 0,
  expected_goal_involvements_per_90     real not null default 0,
  expected_goals_conceded_per_90        real not null default 0,
  -- set pieces (null = not on duty)
  penalties_order                       smallint,
  corners_and_indirect_freekicks_order  smallint,
  direct_freekicks_order                smallint,
  created_at                            timestamptz not null default now(),
  unique (player_id, snapshot_date)
);
create index player_snapshots_date_idx on core.player_snapshots (snapshot_date);

-- ------------------------------------------------------ price_observations --
-- Written every run, but DEDUPED: a row is inserted only when something
-- differs from that player's most recent row. Every run is still recorded in
-- sync_runs, so "no new row" means "unchanged since the previous row" and no
-- information is lost.
create table core.price_observations (
  id                         bigint generated always as identity primary key,
  player_id                  bigint not null references core.players (id) on delete cascade,
  observed_at                timestamptz not null,
  now_cost                   smallint not null,
  -- Signed. Direction comes from THIS, never from the hourly rate.
  price_change_percent       real,
  -- Observed signed in practice despite being described as an activity level;
  -- treat as magnitude only (docs/data-dictionary.md, open question 2).
  price_change_hourly_rate   integer,
  -- [{offset, projected_percent, likelihood}] x3; likelihood is signed -5..+5.
  price_change_projections   jsonb,
  price_change_locked_until  timestamptz,
  price_change_calibrating   boolean,
  unique (player_id, observed_at)
);
create index price_observations_observed_at_idx on core.price_observations (observed_at);

-- --------------------------------------------------- player_gameweek_stats --
-- From event/{gw}/live: one row per player per gameweek. A double gameweek is
-- aggregated into the single row; per-fixture detail is kept in fixture_detail.
create table core.player_gameweek_stats (
  id                          bigint generated always as identity primary key,
  player_id                   bigint not null references core.players (id) on delete cascade,
  gameweek_id                 bigint not null references core.gameweeks (id) on delete cascade,
  minutes                     integer not null default 0,
  starts                      smallint not null default 0,
  goals_scored                smallint not null default 0,
  assists                     smallint not null default 0,
  clean_sheets                smallint not null default 0,
  goals_conceded              smallint not null default 0,
  own_goals                   smallint not null default 0,
  penalties_saved             smallint not null default 0,
  penalties_missed            smallint not null default 0,
  yellow_cards                smallint not null default 0,
  red_cards                   smallint not null default 0,
  saves                       smallint not null default 0,
  bonus                       smallint not null default 0,
  bps                         integer not null default 0,
  defensive_contribution      integer not null default 0,
  total_points                integer not null default 0,
  influence                   real not null default 0,
  creativity                  real not null default 0,
  threat                      real not null default 0,
  ict_index                   real not null default 0,
  expected_goals              real not null default 0,
  expected_assists            real not null default 0,
  expected_goal_involvements  real not null default 0,
  expected_goals_conceded     real not null default 0,
  -- the raw `explain` array: per-fixture points breakdown, ~127 bytes
  fixture_detail              jsonb,
  updated_at                  timestamptz not null default now(),
  unique (player_id, gameweek_id)
);

-- -------------------------------------------------------------- sync_runs --
create table core.sync_runs (
  id           bigint generated always as identity primary key,
  job_name     text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running'
               check (status in ('running', 'success', 'failed', 'skipped')),
  row_counts   jsonb not null default '{}'::jsonb,
  error        text
);
create index sync_runs_job_started_idx on core.sync_runs (job_name, started_at desc);
comment on table core.sync_runs is
  'Every run, including runs that produced no price_observations rows. This is what makes dedup lossless.';

-- ----------------------------------------------------------- change_events --
-- Detected changes. dedup_key makes storing or sending the same change twice
-- impossible; player_id / change_type / occurred_on stay as real columns so
-- the table is still queryable without parsing the key.
create table core.change_events (
  id           bigint generated always as identity primary key,
  dedup_key    text not null unique,     -- 'price_fall:2026-09-22:player:411'
  player_id    bigint references core.players (id) on delete cascade,
  change_type  text not null check (change_type in (
                 'price_rise', 'price_fall', 'status_change',
                 'news_change', 'ownership_move', 'set_piece_change'
               )),
  occurred_on  date not null,
  detected_at  timestamptz not null default now(),
  old_value    jsonb,
  new_value    jsonb,
  importance   smallint not null default 0,
  notified_at  timestamptz,
  sync_run_id  bigint references core.sync_runs (id) on delete set null
);
create index change_events_occurred_idx on core.change_events (occurred_on desc, change_type);
create index change_events_player_idx on core.change_events (player_id);
-- Partial index: the "not yet sent to Make" queue stays tiny.
create index change_events_unnotified_idx on core.change_events (detected_at)
  where notified_at is null;

-- ----------------------------------------------------- RLS: deny by default --
-- Defense in depth. core is not exposed by the Data API, and these tables have
-- no policies, so only the service role (which bypasses RLS) can reach them.
alter table core.seasons               enable row level security;
alter table core.teams                 enable row level security;
alter table core.players               enable row level security;
alter table core.gameweeks             enable row level security;
alter table core.fixtures              enable row level security;
alter table core.cl_fixtures           enable row level security;
alter table core.player_snapshots      enable row level security;
alter table core.price_observations    enable row level security;
alter table core.player_gameweek_stats enable row level security;
alter table core.sync_runs             enable row level security;
alter table core.change_events         enable row level security;
