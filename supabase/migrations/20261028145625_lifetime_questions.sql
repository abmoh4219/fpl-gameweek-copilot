-- Co-pilot questions become a LIFETIME allowance: 5 per account, never reset
-- (the agent key is small). Replaces the daily limit of 10 from `accounts`.
--
-- The per-day rows in app.agent_usage stay as they are — a lifetime total is
-- simply their sum — so nothing is migrated and no history is lost. Still no
-- `security definer`: the caller only ever sees and adds to their own rows.

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
  insert into app.agent_usage (questions) values (1)
  on conflict (user_id, day) do update set questions = app.agent_usage.questions + 1;
  select coalesce(sum(u.questions), 0)::integer into total
  from app.agent_usage u
  where u.user_id = auth.uid();
  return query select total <= lifetime_limit, total, greatest(lifetime_limit - total, 0);
end;
$$;

-- The caller's lifetime total, without consuming one (for the counter).
create view api.my_usage_total with (security_invoker = on) as
select coalesce(sum(questions), 0)::integer as questions
from app.agent_usage;

grant select on api.my_usage_total to authenticated;
revoke all on api.my_usage_total from anon, public;
