-- api.gameweeks (ADR-0020): this season's gameweeks with FPL's own average
-- score, so "Gameweek wrapped" can compare a manager's points with the
-- average. Public football data, so an owner-privileged view with an explicit
-- column allow-list, like the other api views (CLAUDE.md §4a). This is the
-- twelfth accepted "Security Definer View" finding.

create view api.gameweeks as
select
  g.fpl_event_id        as gameweek,
  g.deadline_utc,
  g.finished,
  g.is_current,
  g.average_entry_score
from core.gameweeks g
join core.seasons s on s.id = g.season_id
where s.is_current;

comment on view api.gameweeks is
  'This season''s gameweeks: deadline, finished, current, and FPL''s average score. Read-only.';

grant select on api.gameweeks to anon, authenticated;
