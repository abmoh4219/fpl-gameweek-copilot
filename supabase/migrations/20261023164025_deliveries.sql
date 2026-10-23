-- Deliveries: one row per webhook POSTed to Make (ADR-0006).
--
-- Two jobs for one small table:
--   1. Audit. "Did Make get yesterday's report?" is answered here, not by
--      digging through Make's execution history.
--   2. Budget. price-sync may send an intraday news alert, and every alert
--      costs Make credits. The per-day cap counts rows here.
--
-- A failed POST is recorded too (ok = false), so a broken webhook is visible
-- in SQL as well as in the Telegram alert.

create table core.deliveries (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('daily_report', 'news_alert', 'preview')),
  -- UK calendar date the delivery belongs to; the cap counts per this date
  delivery_date date not null,
  ok            boolean not null,
  http_status   smallint,
  message_count smallint not null,
  event_count   smallint not null default 0,
  report_id     bigint references core.reports (id) on delete set null,
  sync_run_id   bigint references core.sync_runs (id) on delete set null,
  error         text,
  sent_at       timestamptz not null default now()
);

create index deliveries_date_kind_idx on core.deliveries (delivery_date, kind);

alter table core.deliveries enable row level security;

comment on table core.deliveries is
  'One row per Make webhook call. Written by jobs only; never exposed through the api schema.';
