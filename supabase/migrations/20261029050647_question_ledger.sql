-- The lifetime allowance survives account deletion (ADR-0013).
--
-- Until now the question counter lived in app.agent_usage, which is deleted
-- with the account — so deleting an account and signing up again with the
-- same email reset the five questions. The allowance now belongs to the EMAIL
-- ADDRESS, remembered only as a keyed fingerprint:
--
--   fingerprint = HMAC-SHA256(normalised email, a random secret made here)
--
-- The secret never leaves the database, so the fingerprint cannot be turned
-- back into an address or matched against a list of addresses elsewhere.
-- Normalising folds the obvious variants together: case, a "+tag", and the
-- dots Gmail ignores. A genuinely different address still gets a fresh
-- allowance; the service-wide spend cap bounds that.
--
-- Users can neither read nor change the ledger. Two `security definer`
-- functions in `app` (never exposed by the Data API, like ADR-0011's) add one
-- to the caller's own row or read it, and nothing else.

-- --------------------------------------------------------------- secret --

create table app.ledger_key (
  id      boolean primary key default true check (id),
  secret  text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into app.ledger_key default values;

alter table app.ledger_key enable row level security;
revoke all on app.ledger_key from public, anon, authenticated;
-- An explicit "nobody" policy: deny-all stated in code, not implied.
create policy ledger_key_no_access on app.ledger_key for all to anon, authenticated using (false) with check (false);

-- --------------------------------------------------------------- ledger --

create table app.question_ledger (
  fingerprint  text primary key,
  questions    integer not null default 0 check (questions >= 0),
  updated_at   timestamptz not null default now()
);

alter table app.question_ledger enable row level security;
revoke all on app.question_ledger from public, anon, authenticated;
create policy question_ledger_no_access on app.question_ledger for all to anon, authenticated using (false) with check (false);

comment on table app.question_ledger is
  'Co-pilot questions used per email fingerprint (keyed hash, never the address). Survives account deletion so the free allowance cannot be reset.';

-- ----------------------------------------------------------- functions --

create function app.email_fingerprint(email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with parts as (
    select split_part(lower(trim(email)), '@', 1) as local_part,
           split_part(lower(trim(email)), '@', 2) as domain
  ),
  normalised as (
    select case
             when domain in ('gmail.com', 'googlemail.com')
               then replace(split_part(local_part, '+', 1), '.', '') || '@gmail.com'
             else split_part(local_part, '+', 1) || '@' || domain
           end as address
    from parts
  )
  select encode(extensions.hmac(address, (select secret from app.ledger_key), 'sha256'), 'hex')
  from normalised;
$$;

revoke execute on function app.email_fingerprint(text) from public, anon, authenticated;

-- Add one question to the caller's own row; returns the new lifetime total.
create function app.ledger_add_one()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fp text;
  n integer;
begin
  select app.email_fingerprint(u.email) into fp from auth.users u where u.id = auth.uid();
  if fp is null then
    raise exception 'sign in first';
  end if;
  insert into app.question_ledger (fingerprint, questions) values (fp, 1)
  on conflict (fingerprint) do update
    set questions = app.question_ledger.questions + 1, updated_at = now()
  returning questions into n;
  return n;
end;
$$;

-- The caller's own lifetime total, without changing it.
create function app.my_ledger_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select q.questions
     from app.question_ledger q
     where q.fingerprint = (select app.email_fingerprint(u.email) from auth.users u where u.id = auth.uid())),
    0
  );
$$;

revoke execute on function app.ledger_add_one() from public, anon;
revoke execute on function app.my_ledger_count() from public, anon;
grant execute on function app.ledger_add_one() to authenticated;
grant execute on function app.my_ledger_count() to authenticated;

-- ------------------------------------------- carry existing usage over --

insert into app.question_ledger (fingerprint, questions)
select app.email_fingerprint(u.email), sum(a.questions)::integer
from app.agent_usage a
join auth.users u on u.id = a.user_id
where u.email is not null
group by 1
on conflict (fingerprint) do update
  set questions = greatest(app.question_ledger.questions, excluded.questions);

-- ------------------------------------------- the API, same shape as before --

create or replace function api.consume_question()
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Mirrors AGENT_LIMITS.questionsPerAccount (packages/shared); a test asserts they match.
  lifetime_limit constant integer := 5;
  total integer;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  -- Per-day history for the account (deleted with it).
  insert into app.agent_usage (questions) values (1)
  on conflict (user_id, day) do update set questions = app.agent_usage.questions + 1;
  -- The lifetime allowance, by email fingerprint (kept after deletion).
  total := app.ledger_add_one();
  return query select total <= lifetime_limit, total, greatest(lifetime_limit - total, 0);
end;
$$;

create or replace view api.my_usage_total with (security_invoker = on) as
select app.my_ledger_count() as questions;
