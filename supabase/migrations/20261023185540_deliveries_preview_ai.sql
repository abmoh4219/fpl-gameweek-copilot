-- Scenario 2 calls are deliveries too (ADR-0007).
--
-- The preview job POSTs the computed facts to Make Scenario 2, which runs
-- Gemini and answers with the prose. Each of those calls is a row here with
-- kind 'preview_ai', and the daily AI cap (CLAUDE.md §7) counts them —
-- successful or not, because a failed call may still have spent a Gemini
-- request.

alter table core.deliveries drop constraint deliveries_kind_check;
alter table core.deliveries add constraint deliveries_kind_check
  check (kind in ('daily_report', 'news_alert', 'preview', 'preview_ai'));
