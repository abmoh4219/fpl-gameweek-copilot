-- Delete my account (the FAQ promises it, docs/product-plan.md C3).
--
-- Removing a login means deleting the caller's auth.users row, which an
-- ordinary signed-in user cannot do. Options were a server route holding the
-- secret admin key, or one elevated function. We chose the function: no new
-- secret anywhere, and the elevated part is a single statement that can only
-- ever touch the caller's own row.
--
-- The `security definer` function lives in `app`, which the Data API never
-- exposes; the API sees only the `security invoker` wrapper below. Profiles
-- and usage rows go with the user through their `on delete cascade` keys.

create function app.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function app.delete_user() from public, anon;
grant execute on function app.delete_user() to authenticated;

create function api.delete_my_account()
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.delete_user();
$$;

revoke execute on function api.delete_my_account() from public, anon;
grant execute on function api.delete_my_account() to authenticated;

comment on function app.delete_user() is
  'Deletes the CALLER''s own login (auth.uid()). Security definer because users cannot delete auth.users themselves; never exposed by the Data API.';
