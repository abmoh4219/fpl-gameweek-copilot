-- Accounts (docs/product-plan.md): a profile per user with their connected
-- FPL team, and a per-account daily question counter for the co-pilot.
--
-- User-scoped, so the `app` schema rules apply (CLAUDE.md §4a, ADR-0008):
-- RLS policies, column-level grants, `security_invoker` views and functions.
-- Nothing here is `security definer`: every statement runs as the signed-in
-- user, and RLS decides what they may touch. That keeps the Security Advisor
-- free of new findings.

-- ------------------------------------------------------------- profiles --

create table app.profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  fpl_team_id   integer check (fpl_team_id between 1 and 999999999),
  team_name     text check (char_length(team_name) <= 60),
  manager_name  text check (char_length(manager_name) <= 80),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app.profiles enable row level security;

create policy profiles_read_own on app.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_insert_own on app.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on app.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on app.profiles to authenticated;
grant insert (fpl_team_id, team_name, manager_name) on app.profiles to authenticated;
grant update (fpl_team_id, team_name, manager_name, updated_at) on app.profiles to authenticated;

-- The caller's own profile (RLS filters to one row, or none).
create view api.my_profile with (security_invoker = on) as
select user_id, fpl_team_id, team_name, manager_name, created_at, updated_at
from app.profiles;

grant select on api.my_profile to authenticated;

-- Connect (or change) the caller's FPL team. The website checks the team
-- exists on FPL before calling this; the names are what FPL returned.
create function api.connect_team(p_team_id integer, p_team_name text, p_manager_name text)
returns api.my_profile
language sql
security invoker
set search_path = ''
as $$
  insert into app.profiles (fpl_team_id, team_name, manager_name)
  values (p_team_id, p_team_name, p_manager_name)
  on conflict (user_id) do update
    set fpl_team_id = excluded.fpl_team_id,
        team_name = excluded.team_name,
        manager_name = excluded.manager_name,
        updated_at = now()
  returning user_id, fpl_team_id, team_name, manager_name, created_at, updated_at;
$$;

revoke execute on function api.connect_team(integer, text, text) from public, anon;
grant execute on function api.connect_team(integer, text, text) to authenticated;

-- ----------------------------------------------------------- usage -------

-- One row per user per UK day. Users may only ever ADD to their own count:
-- inserts start at 1, updates may not go down, nobody can delete.
create table app.agent_usage (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null default (now() at time zone 'Europe/London')::date,
  questions  integer not null default 1 check (questions >= 0),
  primary key (user_id, day)
);

alter table app.agent_usage enable row level security;

create policy usage_read_own on app.agent_usage
  for select to authenticated using (user_id = auth.uid());
create policy usage_insert_own on app.agent_usage
  for insert to authenticated with check (user_id = auth.uid() and questions = 1);
create policy usage_update_own on app.agent_usage
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on app.agent_usage to authenticated;
grant insert (questions) on app.agent_usage to authenticated;
grant update (questions) on app.agent_usage to authenticated;

create function app.usage_never_decreases() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.questions < old.questions then
    raise exception 'usage counters only go up';
  end if;
  return new;
end;
$$;

create trigger agent_usage_never_decreases
  before update on app.agent_usage
  for each row execute function app.usage_never_decreases();

-- Count one question for the caller and say whether it is within today's
-- limit. The limit lives here AND in AGENT_LIMITS.questionsPerAccountPerDay
-- (packages/shared); a test asserts they match.
create function api.consume_question()
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  daily_limit constant integer := 10;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  insert into app.agent_usage (questions) values (1)
  on conflict (user_id, day) do update set questions = app.agent_usage.questions + 1
  returning questions into n;
  return query select n <= daily_limit, n, greatest(daily_limit - n, 0);
end;
$$;

revoke execute on function api.consume_question() from public, anon;
grant execute on function api.consume_question() to authenticated;

-- Read-only: today's count without consuming one (for the UI badge).
create view api.my_usage_today with (security_invoker = on) as
select day, questions
from app.agent_usage
where day = (now() at time zone 'Europe/London')::date;

grant select on api.my_usage_today to authenticated;

comment on table app.profiles is 'One row per user: the FPL team they connected. RLS: own row only.';
comment on table app.agent_usage is 'Co-pilot questions per user per UK day. Users can only add to their own count.';
