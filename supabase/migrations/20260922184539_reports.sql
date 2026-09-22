-- Generated reports: the output of the insight engine.
--
-- `payload` is STRUCTURED JSON with typed sections, not just a text blob,
-- because the website renders these rows directly. `text` is the rendered
-- Telegram message, and payload.xPost is a manual-publish draft for X
-- (ADR-0002: drafted automatically, published by a human).

create table core.reports (
  id             bigint generated always as identity primary key,
  report_type    text not null check (report_type in ('daily', 'preview')),
  -- daily reports are keyed by date, previews by gameweek
  report_date    date not null,
  gameweek       smallint,
  payload        jsonb not null,
  text           text not null,
  generated_by   text not null default 'template' check (generated_by in ('template', 'ai')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (report_type <> 'preview' or gameweek is not null)
);

-- One daily report per day, one preview per gameweek. Partial indexes because
-- the two report types are keyed on different things.
create unique index reports_daily_key
  on core.reports (report_type, report_date)
  where report_type = 'daily';

create unique index reports_preview_key
  on core.reports (report_type, gameweek)
  where report_type = 'preview';

create index reports_created_idx on core.reports (report_type, created_at desc);

alter table core.reports enable row level security;

comment on table core.reports is
  'Rendered reports. Written by jobs, read by the website through api.latest_reports.';

-- Owner-privileged view, same pattern as every other api view: anon needs no
-- privileges on core, and this definition is the allow-list of what we
-- publish. Serves the newest report of each type.
create view api.latest_reports as
select distinct on (report_type)
  report_type,
  report_date,
  gameweek,
  payload,
  text,
  generated_by,
  created_at
from core.reports
order by report_type, created_at desc;

grant select on api.latest_reports to anon, authenticated;

comment on view api.latest_reports is
  'Newest daily report and newest gameweek preview. payload is structured JSON the site renders directly.';
