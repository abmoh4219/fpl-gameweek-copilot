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
- **Price pressure** — from FPL's own price-change fields (see below), with
  net transfers and ownership as supporting context
- **Captain score** — combined fixture + threat + minutes confidence
- **Differential score** — value relative to ownership
- **Fixture congestion flag** — extra midweek Champions League games

**Hard rule: code computes every number.** Gemini receives already-computed
facts and writes short prose around them. Gemini never calculates, never
ranks, and never introduces a statistic that was not passed in. Anything
forward-looking is labelled an **estimate** in the output text.

### Price watch data source

`bootstrap-static` now exposes FPL's own price-change telemetry:
`price_change_percent`, `price_change_hourly_rate`,
`price_change_projections`, `price_change_locked_until` and
`price_change_calibrating`. **The price watch is built on these fields, not on
our own reverse-engineered thresholds.** Guessing price moves from transfer
counts is a badly-solved problem; FPL is telling us directly.

Two rules that follow from observation:

- **Never take DIRECTION from `price_change_hourly_rate` — but keep its
  sign.** The rate is signed (range -1,191 to 2,700; 340 of 667 negative) and
  its sign disagrees with `price_change_percent` for 113 players. Discarding
  the sign would throw away real information, so we store and expose it.
  **Direction comes only from `price_change_percent`** (negative = moving
  toward a fall).
- **Working hypothesis:** `price_change_percent` is the **position** toward a
  change and `price_change_hourly_rate` is the **current momentum**, so the
  two can legitimately disagree when a move is reversing. The `momentum`
  column in `price_watch` (`with` / `against`) labels that agreement and is
  **EXPERIMENTAL** — a hypothesis under observation, never a signal to act on.
- **`price_change_percent` can exceed 100% without a price change**
  (103.8% observed). Never present crossing 100% as a confirmed change.

- **`price_change_projections[].likelihood` is a signed integer**, observed
  across -5..+5, so it carries direction as well as strength. The array always
  has exactly three entries, `offset` 0, 1 and 2.

Their exact semantics are **undocumented and to be confirmed by observation**,
so they are stored daily from Phase 2 and we learn the rules from our own
history. Open hypotheses live in `docs/data-dictionary.md`. Until they are
confirmed, every price-watch output is labelled an **estimate**.

### Reports the product ships

| Report | Trigger | Content |
| --- | --- | --- |
| Daily price report | Daily sync | Confirmed risers/fallers as full player cards: price change, net transfers, ownership, recent form, xGI/90, minutes, next fixtures with difficulty, goal threat, congestion flag, short verdict |
| Price watch | Daily sync | Players approaching a change, from FPL's own price-change fields — **clearly labelled as an estimate** |
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
        +-- Scenario 2: preview  -> Gemini -> webhook response to jobs/,
                                    which validates it, stores it and
                                    delivers through Scenario 1 (ADR-0007)
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
| **GitHub Actions** | 2,000 min/month (**private** repo) | Scheduled jobs stay **under ~600 min/month**; each run under ~2 minutes. See math below. |
| **Supabase** | 500 MB, project **paused after 7 days idle** | Daily cron doubles as keep-alive. See note below. |
| **Vercel Hobby** | Non-commercial, 100 GB bandwidth | Cached pages, no per-visit third-party calls. |

### Make credit math

Make charges one credit per **module execution**, and a router branch that
runs charges for every module inside it. An iterator over N records charges
N times per downstream module — which is exactly how a free plan dies.

- Daily report: ~30 runs/month x ~4 modules = **~120 credits**
- Pre-deadline preview: ~5 runs/month x ~8 modules (3 in Scenario 2, ~5 in
  Scenario 1) = **~40 credits**
- Intraday news alerts: capped at 2/day x ~3 modules = **at most ~180 credits**
  (ADR-0006)
- Budget ceiling: **~400 credits/month**, leaving real headroom inside 1,000

**Rule: one webhook per run, with a batched payload.** Never one webhook call
per event. Never iterate records inside Make when code can pre-format them.
If a Make change would multiply module executions by the number of players,
it belongs in `jobs/` instead.

### GitHub Actions minutes

The repo is **private**, so Actions minutes are metered: 2,000 free minutes
per month.

- Daily sync: ~2 min x 30 runs = **~60 min/month**
- Deadline runs: ~2 min x ~20 runs = **~40 min/month**
- CI on push (typecheck, lint, test): ~2 min x ~50 = **~100 min/month**
- **Ceiling for scheduled jobs: ~600 min/month**, which leaves ample room for
  CI and manual runs inside 2,000

If a run starts creeping past ~2 minutes, find out why before adding more runs.

### GitHub Actions schedule

- Main sync: **once daily at `30 2 * * *` (02:30 UTC)**. FPL price changes
  land at **~01:30 UK**, which is 00:30 UTC during BST and 01:30 UTC during
  GMT — so 02:30 UTC is safely after the change all year round. GitHub cron
  is **UTC only**; never write a cron expression in UK local time.
- Extra runs: **only near gameweek deadlines**, not all day.
- **Two jobs** (`docs/operations.md`): **price-sync** every 3 hours
  (`17 */3 * * *`, bootstrap-static only, **measured 1.3 s**) and
  **daily-sync** once at `37 2 * * *` (**measured 5.1 s**). Actions bills
  rounded up per run, so checkout and install dominate, not the work: both
  workflows install with `--filter "@fpl/jobs..."` so `web/` is never built.
  Budget ~243 + 60 + 80 CI = **~383 min/month** against our 600 ceiling.
- Runs are cheap on a public repo, but every run costs FPL API politeness and
  Supabase rows. Frequency is a product decision, not a free-for-all.

> **The 60-day scheduled-workflow pause applies to public repositories only.**
> This repo is private, so it does not apply today. Keep it in mind for a
> future public switch: GitHub disables scheduled workflows after 60 days
> without repo activity, which would silently stop the daily sync — and with
> it the Supabase keep-alive described below.

> **Supabase keep-alive:** the daily cron doubles as the keep-alive. A free
> project pauses after 7 days of inactivity, so if jobs fail for 7 days in a
> row the project pauses and the site loses its data source. Sync failures
> alert on Telegram for exactly this reason — treat them as urgent.

---

## 4a. Database rules

Full detail in `docs/database.md`; these are the rules that bind every change.

- **Two schemas.** `core` holds every table and the job-facing views and is
  **never exposed by the Data API**. `api` holds read-only views and is the
  **only** exposed schema. RLS is on for every `core` table, with no policies.
- **`anon` has zero privileges on `core`.** The `api` views are
  owner-privileged, so each view definition is an explicit allow-list of the
  columns we publish.
- **Mixed security model, on purpose.** Public football data uses
  owner-privileged views. **User-scoped tables (waitlist, auth, plans, rate
  limits) must use RLS policies plus `security_invoker` views** — never an
  owner-privileged view over per-user rows.
- **Exactly two Security Advisor findings are accepted**, both deliberate:
  the seven `api` views flagged as **"Security Definer View"**, and
  **"RLS Enabled No Policy"** on every `core` table (intentional deny-all).
  **Anything else the advisor reports is a real problem** and must be fixed.
- **Migrations deploy manually** with `pnpm supabase db push`. Supabase's
  GitHub auto-deploy is **off** — a commit never changes the cloud database.
- **Jobs connect directly to Postgres** (`SUPABASE_DB_URL`), not through the
  Data API, because PostgREST refuses `core` even for the service role
  (ADR-0005).
- **Migrations are immutable once pushed.** Create them with
  `pnpm supabase migration new <name>`; change shipped behaviour with a NEW
  migration, never by editing an old one.
- **Every load is an idempotent upsert** on the table's natural unique key,
  batched to **one statement per table** — never one query per row.
- **Types:** money is **integer tenths** (`now_cost 55` = £5.5m); statistics
  are **`real`**. No `numeric` — nothing here is currency arithmetic.
- **Development data is loaded by the real loaders** (`pnpm load:samples`), not
  by `seed.sql`, so local work and tests exercise the production path.
- **Storage is a real constraint.** 500 MB including indexes. Season 1 lands at
  ~304 MB and season 2 at ~474 MB, so `player_snapshots` needs its own
  retention rule before a second season starts.

---

## 4b. Job rules

- **price-sync detects status and news changes intraday.** Injury news lands
  Thursday and Friday afternoons after press conferences and deadlines are
  often Friday evening, so detecting it only at 02:37 UTC would deliver it
  after the deadline. Price and ownership changes stay **daily-only** — a
  price change happens once, at the nightly update.
- **Dedup key granularity is a product decision.** `type:date:player` for
  price, ownership and set pieces (one per player per day). Status keys
  include the **new status** and news keys a **hash of the new text**, because
  `a -> d` then `d -> i` on the same day are two different pieces of news.
- **An event is refreshed only while `notified_at` is null.** Once Phase 5 has
  delivered it, re-running detection must not rewrite what was sent.
- **Every run writes `core.sync_runs`**, including runs that write no price
  rows. That is what makes the dedup lossless: no row means "unchanged", not
  "not observed".
- **Upstream unavailable is `skipped`, not `failed`.** FPL answers 503 while a
  gameweek is being scored; off-season means no current gameweek. Neither
  pages anyone.
- **`DRY_RUN=true` writes nothing at all**, not even a `sync_runs` row.
- **Jobs refuse a non-local database** unless `GITHUB_ACTIONS=true` or
  `--cloud`. The cloud `SUPABASE_DB_URL` lives **only in GitHub Secrets**.
- **Alerts go straight to Telegram from code**, never through Make — Make is
  part of what is being monitored. Every message passes through the redactor
  in `jobs/src/telegram.ts`; a Telegram failure never hides the original error.
- **Dead man's switch**: price-sync alerts if no `daily-sync` has succeeded in
  26 hours, with a 6-hour cooldown, cleared by the next success. Seven days of
  failure pauses the Supabase project.

---

## 4c. Insight engine rules

- **Every weight, threshold and band lives in
  `packages/shared/src/insights/config.ts`.** No scoring function may hardcode
  a number that belongs there.
- **Insights are pure functions** over view rows — no database, no clock, no
  network — so every rule is unit-testable against synthetic data.
- **Reports read the Phase 2 views**, never raw tables.
- **`momentum` and `hourly_rate` never reach a report.** The hypothesis behind
  them is unvalidated; a test asserts they are absent from every payload.
- **Never trust a per-90 rate without minutes behind it.** A player with 3
  season minutes showed 12.9 xGI/90. Threat is scaled by sample size, which
  also encodes the obvious point that someone who does not play has no threat.
- **`strength_overall_*` is a 1-5 scale** (observed 2-4), and
  **`strength_defence_*` is zero for every team** — goal threat falls back to
  overall strength. Getting this wrong floored every fixture at "Easy".
- **Report payloads are structured JSON with typed sections**, because the
  website renders the same rows the Telegram message is built from. The text
  is one rendering, not the source of truth.
- **X drafts are generated, never posted** (ADR-0002), capped at 240
  characters, and carry concrete numbers from the payload.
- **Forward-looking output is labelled an estimate**, every time.

---

## 5. FPL API rules

The FPL public API is undocumented, unauthenticated, and a courtesy. Be a
good citizen: **few requests, cached, snapshotted.**

- `bootstrap-static/` is fetched **once per run** and passed around the job.
  Never fetch it twice in one process.
- Per-gameweek stats for all players come from **`event/{gw}/live/` — one
  call** — instead of hundreds of `element-summary` calls.
  **Confirmed in Phase 1: `event/{gw}/live/` DOES include per-player expected
  stats** (`expected_goals`, `expected_assists`,
  `expected_goal_involvements`, `expected_goals_conceded`, all as strings),
  alongside `defensive_contribution`, `starts`, `bps` and ICT. One call
  returns all 667 players, so there is **no reason to ever sweep
  `element-summary`** for xGI.
- `element-summary/{id}/` only for a **small set of players of interest**
  (squad members, alert subjects), never a full sweep.
- Snapshot responses to Supabase and read from the database afterwards.
  Re-derive from stored snapshots rather than re-fetching.
- **`event-status/`** is a cheap extra call telling us whether a gameweek's
  points and bonus are final. Use it instead of inferring from `finished`
  flags.
- Every response is parsed with Zod before use (§9).

**Data shape rules (confirmed by exploration, Phase 1):**

- **All IDs are season-scoped.** Team, player and fixture IDs are reassigned
  every season — this season's Premier League includes Coventry, Hull and
  Ipswich. Never hardcode an ID, never carry one across seasons, and never
  assume last season's mapping still holds.
- **Mixed types in `elements`.** Season totals (`expected_goals`,
  `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded`,
  `form`, `ep_next`, `selected_by_percent`, `ict_index`, `points_per_game`)
  arrive as **strings**, while the `*_per_90` fields arrive as **numbers**.
  Convert at the schema boundary; never do arithmetic on a raw value.
- **`now_cost` is in tenths** (`55` = £5.5m). It stays in tenths throughout
  the data layer; convert only for display, with the shared helper.
- The price-change fields (§2) are **stored daily from Phase 2** so their
  meaning can be confirmed against our own history. They are optional data:
  see the pipeline rule in §10.

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
- **One request per day**, scoped with `dateFrom` / `dateTo`.
- **The window must look BACKWARD as well as forward, and must include
  `FINISHED` matches.** The congestion flag has to know about a Champions
  League match that was already played, or `is_after_cl` can never fire and
  `days_since_cl` is always null.
  - Statuses: `SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED`.
  - Lookback: **35 days**, not a few. League-stage matchdays are weeks apart —
    2026/27 matchday 1 ran 8-10 September and matchday 2 not until 13 October,
    a 33-day gap. A short lookback leaves the "days since" column empty.
  - Forward: ~45 days, matching how far the fixture ticker looks.
  - It is still **one request**; a wider window costs nothing extra.
- **Rate-limit headers: read case-insensitively and support both names.** The
  API actually returns **`x-requests-available-minute`**, not the documented
  `X-RequestsAvailable`, alongside `X-RequestCounter-Reset`. Check both
  spellings and back off when low.
- **Never map teams by TLA — TLAs are not unique.** `FCB` is both Barcelona
  and Bayern Munich, and Bodø/Glimt reports `FK`. **Map by football-data
  numeric team ID only**, through `packages/shared/src/teams.ts`.
- **Refresh on every run; never cache "the season's fixtures" once.**
  Champions League knockout fixtures are only added after the league stage
  finishes, so a cached season snapshot goes stale silently.
- **Which PL clubs are in the CL is derived, not hardcoded** — intersect each
  fetch with the team map, so the list updates itself as clubs qualify or drop
  out. (Observed this season: Arsenal 57, Aston Villa 58, Liverpool 64,
  Man City 65, Man United 66 — kept only as a test sanity check.)
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
| `docs/` | `decisions.md` (ADRs), `database.md`, `data-dictionary.md`, `operations.md` |
| `samples/` | Recorded API responses for offline development and tests |

> **`samples/fpl/entry.json` and `samples/fpl/entry-picks.json` contain a real
> manager's personal FPL team.** That is acceptable while this repo is
> private. **Before any public switch, replace them with anonymised samples**,
> alongside the `gitleaks` history scan in §10.

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
- **Nothing scans for leaked secrets here.** GitHub secret scanning is
  unlikely to be available on a private repo without Advanced Security, so a
  committed key would go unnoticed. Never write a real secret into a file,
  never print a token in logs or error messages, and **scan the full history
  with `gitleaks` before making this repo public**.
- **Optional data never takes down the core pipeline.** The price-change
  fields and the Champions League sync are enrichment. If they are missing,
  renamed or failing, the daily pipeline still completes and publishes
  everything else, with the optional part absent and a warning logged. Only
  data the core reports genuinely depend on is allowed to fail a run.
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
