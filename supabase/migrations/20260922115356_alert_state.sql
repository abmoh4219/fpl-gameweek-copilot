-- Alert state: remembers when an operational alert was last sent, so a
-- recurring condition does not page on every run.
--
-- The dead man's switch is the first user: price-sync checks the last
-- SUCCESSFUL daily-sync and alerts if it is more than 26 hours old. Without
-- this table that alert would fire every 3 hours until someone noticed.
--
-- Presence of a row means "already alerted". The row is DELETED when the
-- condition clears, so the next failure alerts immediately rather than
-- waiting out a cooldown.

create table core.alert_state (
  key           text primary key,
  last_sent_at  timestamptz not null,
  context       jsonb,
  updated_at    timestamptz not null default now()
);

alter table core.alert_state enable row level security;

comment on table core.alert_state is
  'One row per alert key. Written by jobs only; never exposed through the api schema.';
