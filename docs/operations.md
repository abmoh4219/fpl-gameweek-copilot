# Operations

What runs, when, how to check it, and what to do when it breaks.

---

## What runs when

| Workflow | Schedule (UTC) | Runs/day | What it does |
| --- | --- | --- | --- |
| `price-sync` | `17 */3 * * *` — 00:17, 03:17 … 21:17 | 8 | bootstrap-static only: players, price telemetry, **status and news changes** |
| `daily-sync` | `37 2 * * *` — 02:37 | 1 | everything: fixtures, gameweek stats, Champions League, day-over-day changes, retention |
| `ci` | on push / PR (skips docs-only) | — | typecheck + tests |

**Why those minutes.** GitHub delays schedules clustered at the top of the
hour, so both use an odd off-peak minute. **02:37 UTC** is after the ~01:30 UK
price change in both BST (00:30 UTC) and GMT (01:30 UTC). GitHub cron is
**UTC only** — never write one of these in UK local time.

**Why price-sync detects status and news.** Injury news lands on Thursday and
Friday afternoons after press conferences, and deadlines are often Friday
evening. Detecting it only at 02:37 would deliver it *after* the deadline.
Price and ownership changes stay daily-only, because a price change happens
once, at the nightly update.

Both sync workflows share the concurrency group `fpl-sync` with
`cancel-in-progress: false`, so they never write at the same time and a run
part way through writing is never killed. CI uses its own group **with**
cancellation — never do that to a sync.

### Minutes budget

Private repo: 2,000 minutes/month, billed **rounded up per run**. Our own
ceiling is 600.

| Workflow | Runs/month | Measured job time | Billed |
| --- | --- | --- | --- |
| price-sync | ~243 | **1.3 s** | 243 min if the whole run fits in 60 s |
| daily-sync | ~30 | **5.1 s** | ~60 min |
| ci | ~40 | — | ~80 min |

The jobs themselves are nowhere near the limit; **checkout, Node setup and
install dominate**. That is why both workflows use `pnpm install --filter
"@fpl/jobs..."` (never installing `web/`) and the pnpm store cache. If the
Actions log shows price-sync billing 2 minutes, change its cron to
`17 */4 * * *` — 182 runs, ~522 minutes worst case.

---

## Running a job by hand

```bash
pnpm db:start                 # local stack, needs Docker
pnpm job:price                # light job
pnpm job:daily                # full job, also builds today's report
pnpm job:preview              # gameweek preview, manual
pnpm backfill:gw 1 2 3 4      # per-gameweek stats for named gameweeks
DRY_RUN=true pnpm job:daily   # fetch + detect, write NOTHING
```

A dry run against an **empty** database reports what it *would* create rather
than failing, so the first thing anyone tries works.

A dry run writes nothing at all — not even a `sync_runs` row — so it leaves no
trace in history. It prints the change events it *would* have written.

**Safety.** Jobs refuse a non-local `SUPABASE_DB_URL` unless
`GITHUB_ACTIONS=true` or `--cloud` is passed. The cloud connection string
lives **only in GitHub Secrets**; it must never be put in `.env`.

From the Actions tab, both workflows offer **Run workflow** with two inputs:

- `dry_run` — as above
- `simulate_failure` — forces a failure to prove the Telegram alert works

---

## Reading `sync_runs`

Every run is recorded, which is what makes the price dedup lossless: **no
observation row means "unchanged", not "not observed"**.

```sql
select id, job_name, status,
       finished_at - started_at as duration,
       row_counts, left(coalesce(error, ''), 120) as error
from core.sync_runs
order by started_at desc
limit 20;
```

| Status | Meaning | Action |
| --- | --- | --- |
| `success` | Everything written | none |
| `skipped` | Nothing to do, or upstream unavailable. `row_counts.skipped_reason` says which | none — it retries on the next schedule |
| `failed` | Something broke. `error` has the redacted message | investigate; a Telegram alert was sent |
| `running` | In progress, or the runner died mid-run | if older than an hour, treat as failed |

`row_counts.warnings` lists non-fatal problems — almost always a Champions
League fetch that failed. **That never fails a run**: the congestion flag is
enrichment, and everything else still publishes.

---

## Alerts

All alerts come **straight from code to Telegram**, never through Make —
Make is part of what is being monitored. Every message is passed through a
redactor that strips connection strings, bot tokens, Supabase keys and JWTs.

| Alert | Trigger | What it means | What to do |
| --- | --- | --- | --- |
| **sync failed** | any unhandled error | the run wrote nothing useful | open the linked Actions run; check `sync_runs.error` |
| **daily-sync is stale** | no successful `daily-sync` in **26 h** | reports are not being produced | see below — this is the urgent one |

### The dead man's switch

`price-sync` checks the last *successful* `daily-sync` on every run. Past 26
hours (not 24, so a slow run or a DST shift does not cry wolf) it alerts, then
stays quiet for 6 hours so a persistent outage does not page eight times a day.
A successful `daily-sync` **deletes** the alert row, so the next failure pages
immediately rather than waiting out a cooldown.

It matters because a stalled pipeline is silent by nature, and **a Supabase
free project pauses after 7 days of inactivity**. Seven days of failures costs
the database, not just the reports.

---

## Recovery

**A single failed run** — no action needed; the next schedule picks it up.
Prices are re-read from scratch each run, and every load is an idempotent
upsert.

**Re-run now**: Actions → the workflow → **Run workflow**. Safe at any time.

**Backfilling a missed day.** `player_snapshots` is keyed on
`(player_id, snapshot_date)`, so a day with no run is a permanent gap — the
FPL API only ever serves *today*. Nothing can recover it, and
`price_changes_daily` will simply compare across the gap. Say so in any report
rather than pretending the comparison is day-over-day.

**Form looks wrong after seeding a database mid-season.** `player_form` needs
four finished gameweeks. Use `pnpm backfill:gw 1 2 3 4` to pull them, then
re-run `pnpm job:daily` to rebuild the report.

**Gameweek stats backlog.** `daily-sync` fetches at most **5 gameweeks** of
live stats per run (current, plus any finished gameweek FPL has not marked
`data_checked`). A longer backlog is logged as a warning and catches up over
the following days. To force it, re-run the workflow — each run takes another
five.

**Champions League data missing.** Check `row_counts.warnings`. It is optional
data; the flag is simply absent until the next successful fetch. Verify
`FOOTBALL_DATA_API_TOKEN` is still valid, and remember the free tier is
**10 requests/minute** and covers the Champions League only.

**FPL "game is being updated".** The API goes read-only while a gameweek is
scored and answers 503. Runs mark themselves `skipped`; nobody is paged. If it
persists for more than a few hours, check whether FPL is having a bad day.

**Supabase project paused.** Un-pause it in the dashboard, then run
`pnpm job:daily` manually to restart the clock.

---

## Deploying a schema change

Supabase's GitHub auto-deploy is **off**. A commit never changes the cloud
database.

```bash
pnpm supabase migration new <name>   # write the SQL
pnpm db:reset                        # verify locally, from scratch
pnpm test                            # integration tests run against local
pnpm supabase db push                # deploy, deliberately
```

Migrations are **immutable once pushed**. Change shipped behaviour with a new
migration, never by editing an old one.
