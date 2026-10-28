-- Performance Advisor fixes (CLAUDE.md §4a: anything beyond the two accepted
-- Security Advisor findings gets fixed).
--
-- 1. auth_rls_initplan — the `app` policies called auth.uid() directly, which
--    Postgres re-evaluates for every row. Wrapped as (select auth.uid()) it is
--    computed once per statement. Same rules, same tests; only faster.
-- 2. unindexed_foreign_keys — five `core` foreign keys had no index on the
--    referencing column, so deleting a parent row (a season, a gameweek, a
--    sync run, a report) would scan the child table. The tables are small or
--    append-only, so each index costs very little storage.
--
-- Left as they are, deliberately: the "unused index" notices. Those indexes
-- serve the retention job and history queries that have not run yet.

alter policy profiles_read_own on app.profiles
  using (user_id = (select auth.uid()));
alter policy profiles_insert_own on app.profiles
  with check (user_id = (select auth.uid()));
alter policy profiles_update_own on app.profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy usage_read_own on app.agent_usage
  using (user_id = (select auth.uid()));
alter policy usage_insert_own on app.agent_usage
  with check (user_id = (select auth.uid()) and questions = 1);
alter policy usage_update_own on app.agent_usage
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index cl_fixtures_season_id_idx on core.cl_fixtures (season_id);
create index player_gameweek_stats_gameweek_id_idx on core.player_gameweek_stats (gameweek_id);
create index change_events_sync_run_id_idx on core.change_events (sync_run_id);
create index deliveries_report_id_idx on core.deliveries (report_id);
create index deliveries_sync_run_id_idx on core.deliveries (sync_run_id);
