-- Schemas and role grants.
--
-- Security model (docs/database.md, CLAUDE.md):
--   core  every table + the views jobs use. NOT exposed by the Data API.
--   api   read-only views for the public website. The ONLY exposed schema.
--
-- `anon` gets zero privileges on core. The api views are owner-privileged
-- (security_invoker off, the PostgreSQL default), so they read core as their
-- owner and each view definition is an explicit allow-list of public columns.
--
-- RLS is enabled on every core table anyway, with no policies, so a
-- misconfigured Data API still serves nothing.

create schema if not exists core;
create schema if not exists api;

-- Nothing in core is reachable by the API roles, at any level.
revoke all on schema core from anon, authenticated;
revoke all privileges on all tables in schema core from anon, authenticated;
revoke all privileges on all sequences in schema core from anon, authenticated;
revoke all privileges on all functions in schema core from anon, authenticated;

-- Future core objects must not become readable by accident.
alter default privileges in schema core
  revoke all on tables from anon, authenticated;
alter default privileges in schema core
  revoke all on sequences from anon, authenticated;
alter default privileges in schema core
  revoke all on functions from anon, authenticated;

-- The website reaches api views, and nothing else. SELECT is granted per view
-- in the api_views migration, never wholesale.
grant usage on schema api to anon, authenticated;

-- api holds views only: no direct table access is ever granted here either.
alter default privileges in schema api
  revoke all on tables from anon, authenticated;

comment on schema core is
  'Private schema: all tables and job-facing views. Never exposed by the Data API.';
comment on schema api is
  'Public schema: read-only views for the website. The only schema exposed by the Data API.';
