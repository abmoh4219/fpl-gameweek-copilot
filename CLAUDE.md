# CLAUDE.md — FPL Gameweek Copilot

Guidance for Claude Code (and any human) working in this repo.
Read this before proposing or writing code.

---

## 1. Purpose

FPL managers lose time every day checking the same things by hand: price
changes, injury flags, press-conference news, and how the next few fixtures
look. This project watches that data for them.

The pipeline:

1. **Watches** — syncs the FPL public API daily (plus extra runs near
   deadlines) and stores a snapshot per run.
2. **Detects** — diffs the newest snapshot against the previous one to find
   price changes, status/injury/news changes, and ownership moves.
3. **Decides** — scores what actually matters (is it a big name? is it in my
   squad? is it a confirmed riser?) so we alert on signal, not noise.
4. **Delivers** — one webhook to Make.com, which formats and sends to a
   Telegram channel and drafts X posts.
5. **Explains** — before each gameweek deadline, writes a preview from
   computed facts.

---

## 2. Product vision

This is a portfolio project, but it is built as a **real co-pilot for serious
FPL managers**, and structured so it could be monetized later. Design every
piece as if someone will pay for it: correct numbers, clear sourcing, no
filler.

### Insight engine

All analysis lives in `packages/shared` as pure functions with unit tests.
Metrics to compute:

- **Form** — weighted recent points
- **xGI/90** — expected goal involvements per 90 minutes
- **Minutes risk** — rotation / cameo / injury-return risk
- **Fixture difficulty** — next 3 and next 5 gameweeks
- **Goal threat** — shots, big chances, penalty duty
- **Price pressure** — net transfers vs. ownership, direction and momentum
- **Captain score** — combined fixture + threat + minutes confidence
- **Differential score** — value relative to ownership
- **Fixture congestion flag** — extra midweek Champions League games

**Hard rule: code computes every number.** Gemini receives already-computed
facts and writes short prose around them. Gemini never calculates, never
ranks, and never introduces a statistic that was not passed in. Anything
forward-looking is labelled an **estimate** in the output text.

### Reports the product ships

| Report | Trigger | Content |
| --- | --- | --- |
| Daily price report | Daily sync | Confirmed risers/fallers as full player cards: price change, net transfers, ownership, recent form, xGI/90, minutes, next fixtures with difficulty, goal threat, congestion flag, short verdict |
| Price watch | Daily sync | Players approaching a change — **clearly labelled as an estimate** |
| Injury / news changes | Daily sync | Status flag and news-text changes, with squad impact |
| Pre-deadline preview | ~5× per month | Captain options, differentials, fixture swings, congestion |
| Personal squad report | On request (FPL team ID) | The above, filtered to one manager's 15 players |

### Web surface

- Polished landing page with **waitlist signup stored in Supabase**
- `/today` — the day's price and news changes
- `/players/[id]` — player card with computed metrics
- `/fixtures` — fixture difficulty grid
- `/previews/[gw]` — stored gameweek previews
- `/my-team` — personal squad report by FPL team ID

---

## 3. Architecture

```
  FPL public API                football-data.org
  (bootstrap-static,            (Champions League
   fixtures, event/{gw}/live,    fixture dates only)
   entry picks)                        |
        |                              |
        +--------------+---------------+
                       v
        GitHub Actions cron  ->  jobs/  (TypeScript, tsx)
                       |
                       |  snapshot + diff + score
                       v
                   Supabase  (Postgres: snapshots, changes,
                       |      players, fixtures, previews,
                       |      waitlist; read-only views for web)
                       |
        +--------------+---------------------+
        |                                    |
   ONE webhook per run                  Next.js on Vercel
   (only if important events)           - public pages from views
        |                               - share images for X
        v                               - /api/telegram bot route
    Make.com (2 scenarios)
        |
        +-- Scenario 1: events   -> router -> Telegram channel
        |                                  -> X draft sent to me
        +-- Scenario 2: preview  -> Gemini -> Telegram -> back to Supabase
```

Sync failures do **not** go through Make. `jobs/` calls the Telegram Bot API
directly so an alert still arrives when the pipeline (or Make) is broken.

---

## 4. Free-tier budget

Free tiers only. No paid services anywhere in this project.

| Service | Limit | Our budget / rule |
| --- | --- | --- |
| **Make.com** | 1,000 credits/month, 2 active scenarios, 15-min minimum interval | Daily report + preview must stay **under ~400 credits/month**. See math below. |
| **Gemini API** | Free-tier RPM / RPD caps (re-check current values — they change) | ~5 calls/month for previews. Never called in a loop, never per player, never by a website visitor. |
| **football-data.org** | 10 requests/minute, 12 competitions | **1 request/day.** See §6. |
| **GitHub Actions** | Unlimited minutes (public repo) | Still keep each run under ~2 minutes. Schedule stays sensible, not chatty. |
| **Supabase** | 500 MB, project **paused after 7 days idle** | Daily cron doubles as keep-alive. See note below. |
| **Vercel Hobby** | Non-commercial, 100 GB bandwidth | Cached pages, no per-visit third-party calls. |

### Make credit math

Make charges one credit per **module execution**, and a router branch that
runs charges for every module inside it. An iterator over N records charges
N times per downstream module — which is exactly how a free plan dies.

- Daily report: ~30 runs/month x ~4 modules = **~120 credits**
- Pre-deadline preview: ~5 runs/month x ~5 modules = **~25 credits**
- Budget ceiling: **~400 credits/month**, leaving real headroom inside 1,000

**Rule: one webhook per run, with a batched payload.** Never one webhook call
per event. Never iterate records inside Make when code can pre-format them.
If a Make change would multiply module executions by the number of players,
it belongs in `jobs/` instead.

### GitHub Actions schedule

- Main sync: **once daily**, timed to land after FPL price changes (~02:30
  UK). GitHub cron is **UTC only** — UK time shifts with BST, so schedule
  with enough margin to be safely after the change in both GMT and BST, and
  keep the offset noted in the workflow file.
- Extra runs: **only near gameweek deadlines**, not all day.
- Runs are cheap on a public repo, but every run costs FPL API politeness and
  Supabase rows. Frequency is a product decision, not a free-for-all.

> **Scheduled workflows are disabled by GitHub after 60 days without repo
> activity.** That silently stops the daily sync — and because the daily cron
> is also the Supabase keep-alive, the Supabase project then pauses too. If
> the repo goes quiet for two months, expect to re-enable the workflow and
> un-pause the database.

> **Supabase keep-alive:** the daily cron doubles as the keep-alive. A free
> project pauses after 7 days of inactivity, so if jobs fail for 7 days in a
> row the project pauses and the site loses its data source. Sync failures
> alert on Telegram for exactly this reason — treat them as urgent.

---

## 5. FPL API rules

The FPL public API is undocumented, unauthenticated, and a courtesy. Be a
good citizen: **few requests, cached, snapshotted.**

- `bootstrap-static/` is fetched **once per run** and passed around the job.
  Never fetch it twice in one process.
- Per-gameweek stats for all players come from **`event/{gw}/live/` — one
  call** — instead of hundreds of `element-summary` calls.
  *(Verify the exact shape in Phase 1 before relying on it.)*
- `element-summary/{id}/` only for a **small set of players of interest**
  (squad members, alert subjects), never a full sweep.
- Snapshot responses to Supabase and read from the database afterwards.
  Re-derive from stored snapshots rather than re-fetching.
- Every response is parsed with Zod before use (§9).

---

## 6. football-data.org rules

- **FPL scores Premier League matches only, so we use NO European stats.**
  Premier League fixtures come from the FPL API, not from here.
- football-data.org is used for **one thing only**: Champions League fixture
  dates for Premier League clubs, to compute the **fixture congestion flag**.
- Use competition code **`CL` (id 2001)**.
  **WARNING: the code `UCL` is the Conference League, not the Champions
  League.** Getting this wrong silently produces a wrong flag.
- The free tier covers **12 competitions**. Europa League, Conference League
  and domestic cups are **not** included — so the UI must state that the
  congestion flag covers **Champions League games only**.
- **One request per day**, scoped with `dateFrom` / `dateTo` and
  `status=SCHEDULED,TIMED`. Read the `X-RequestsAvailable` and
  `X-RequestCounter-Reset` response headers and back off when low.
- This sync is **optional**: if it fails, the pipeline must still complete
  and publish everything else, with the congestion flag simply absent.
- **Development and tests use saved responses in `samples/`, never the live
  API.**

---

## 7. Quota protection

A visitor must never be able to burn a quota. All expensive work happens in
the pipeline; the website and bot read what the pipeline already produced.

- **Visitors never trigger Gemini or football-data.org calls.** AI text is
  generated by the pipeline, stored in Supabase, and served from the database.
- **`/my-team` is the only live FPL call.** Cached per team ID per gameweek,
  and rate-limited per IP.
- **Personal reports use templates, not AI.**
- **Daily AI budget cap** in code. On reaching the cap, or on any Gemini
  error, fall back to the template version — the report still ships.
- **Pages are cached.** The Telegram bot answers **from the database only**,
  with a per-user cooldown.

---

## 8. Before monetizing

Not blockers for building, but blockers for charging. Revisit all of these
before taking money:

- **No official Premier League or FPL logos, no club badges, no player
  photos.** Use our own branding and generic visuals throughout.
- **Vercel Hobby is non-commercial** — a commercial plan is required before
  charging.
- **The Gemini free tier may use our inputs** — check the terms before
  sending anything that must stay private, and before charging.
- Keep the data model ready for **Supabase Auth** and **free/pro plans**
  (user IDs, plan column, per-plan limits) even while everything is public.

---

## 9. Folder map

| Path | What lives there |
| --- | --- |
| `jobs/` | TypeScript scripts run by GitHub Actions cron: sync, detect changes, post the webhook, send failure alerts |
| `web/` | Next.js app on Vercel: public pages, share images, `/api/telegram` bot route |
| `packages/shared/` | Zod schemas, database types, and the insight engine — shared by `jobs/` and `web/`, unit tested |
| `supabase/migrations/` | Versioned SQL: tables, snapshot schema, read-only views the web app reads |
| `make/blueprints/` | Exported **sanitised** Make.com scenario JSON, version controlled |
| `.github/workflows/` | Cron and CI workflow definitions |
| `docs/` | `decisions.md` (ADRs), runbooks, setup notes |
| `samples/` | Recorded API responses for offline development and tests |

Workspace packages are `jobs/` (`@fpl/jobs`), `web/` (`@fpl/web`) and
`packages/shared/` (`@fpl/shared`). `supabase/`, `make/`, `docs/` and
`samples/` are plain directories — no `package.json`, nothing installed.

`tsconfig.base.json` deliberately sets no `module` / `moduleResolution`: each
package picks its own (Next.js and a Node script want different ones) and
extends the shared strictness.

---

## 10. Conventions

- **Strict TypeScript.** Every package extends `tsconfig.base.json`, which
  includes `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **Zod on all external data.** FPL API, football-data.org, Telegram updates,
  and anything coming back from Make is parsed at the boundary. No `as` casts
  on external data, no trusting a shape because it looked right once.
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Never commit secrets.** Real values live in GitHub Secrets, Vercel
  environment variables, or Make — never in this repo. `.env.example` holds
  placeholders only. Raw Make exports (`make/blueprints/*.raw.json`) are
  gitignored because they embed live webhook and connection IDs; only
  sanitised blueprints are committed.
- **Few and cached requests to the FPL API** (§5).
- **No new dependency** without saying what it replaces and why the standard
  library or an existing dependency will not do.

---

## 11. Rules for Claude

1. **Explain design decisions and trade-offs before implementing.** State the
   options, the cost of each, and the recommendation — then write the code.
2. **Prefer the simplest solution that works.** This runs on free tiers and is
   maintained by one person. Clever costs more than it returns here.
3. Record anything structural in `docs/decisions.md` as an ADR.
4. If a change would raise usage of Make, Gemini, football-data.org or the FPL
   API, say so explicitly with the new numbers before making it.
