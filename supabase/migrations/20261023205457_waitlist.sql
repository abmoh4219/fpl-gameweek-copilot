-- Waitlist: the first USER-SCOPED table (ADR-0008).
--
-- CLAUDE.md §4a: per-user rows get RLS policies and security_invoker views,
-- never an owner-privileged view. They also never live in `core`, where anon
-- must keep exactly zero privileges. So user-scoped tables get their own
-- schema, `app`:
--
--   core  public football data, written by jobs only     anon: nothing
--   app   per-user rows, guarded by RLS policies          anon: INSERT only
--   api   the only exposed schema
--
-- The website INSERTs through api.waitlist. Nobody can read the list back over
-- the Data API: there is no SELECT grant and no SELECT policy. Jobs and the
-- owner read it over a direct connection.

create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to anon, authenticated;

-- Nothing new in app becomes reachable by accident.
alter default privileges in schema app revoke all on tables    from anon, authenticated;
alter default privileges in schema app revoke all on sequences from anon, authenticated;
alter default privileges in schema app revoke all on functions from anon, authenticated;

create table app.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null,
  source      text,
  created_at  timestamptz not null default now(),
  constraint waitlist_email_shape check (
    char_length(email) between 6 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint waitlist_source_shape check (source is null or char_length(source) <= 40)
);

-- One row per address, whatever its case. A duplicate answers 409, which the
-- site shows as success: it must not reveal whether an address is on the list.
create unique index waitlist_email_key on app.waitlist (lower(email));

alter table app.waitlist enable row level security;

-- A real check rather than `true`: the policy is the security boundary here,
-- so it validates the row itself instead of trusting the constraints alone.
create policy waitlist_anyone_can_join on app.waitlist
  for insert to anon, authenticated
  with check (
    char_length(email) between 6 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (source is null or char_length(source) <= 40)
  );

-- Column-level: a caller can set email and source, nothing else.
grant insert (email, source) on app.waitlist to anon, authenticated;

-- security_invoker: the INSERT runs as the caller, so the grant and the RLS
-- policy above both apply. This is NOT one of the accepted owner-privileged
-- views, and the Security Advisor must not flag it.
create view api.waitlist with (security_invoker = on) as
select email, source from app.waitlist;

grant insert on api.waitlist to anon, authenticated;

comment on schema app is
  'Per-user rows (waitlist; later auth, plans, rate limits). RLS policies + security_invoker views. Never exposed directly.';
comment on table app.waitlist is
  'Landing-page signups. Insert-only over the Data API; never readable by anon.';
comment on view api.waitlist is
  'INSERT-only entry point to app.waitlist. security_invoker, so RLS applies. Selecting returns permission denied.';
