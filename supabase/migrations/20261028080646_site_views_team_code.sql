-- Expose each club's stable `code` on the site views (docs/agent-plan.md §4).
--
-- The squad view colours shirts by club. Team ids are reassigned every season
-- (CLAUDE.md §5); FPL's team `code` is not, so kit colours are keyed by it.
-- `create or replace` keeps the grants; the new column goes LAST, as
-- PostgreSQL requires when replacing a view.

create or replace view api.player_cards as
select
  p.fpl_id,
  p.web_name,
  t.short_name as team_short_name,
  c.card,
  c.updated_at,
  t.fpl_code   as team_code
from core.player_cards c
join core.players p on p.id = c.player_id
join core.teams t   on t.id = p.team_id
join core.seasons s on s.id = p.season_id and s.is_current;

create or replace view api.team_runs as
select
  t.fpl_id     as team_fpl_id,
  t.name       as team_name,
  t.short_name as team_short_name,
  r.run,
  r.updated_at,
  t.fpl_code   as team_code
from core.team_runs r
join core.teams t   on t.id = r.team_id
join core.seasons s on s.id = t.season_id and s.is_current;
