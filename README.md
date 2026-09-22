# FPL Gameweek Copilot

An automated football-data pipeline that watches Fantasy Premier League data,
detects what changed, works out what matters, and delivers it — daily reports
to Telegram, a pre-deadline preview, and a web app with player cards and
fixture difficulty.

Built entirely on free tiers.

> **Status:** Phase 0 — scaffolding. No application code yet.

---

## The problem

FPL managers repeat the same manual checks every single day:

- Did any of my players rise or fall in price overnight?
- Who is close to a change, and should I move before it happens?
- Any new injuries, suspensions, or press-conference news?
- How do the next few fixtures actually look — and who has a midweek European
  game before them?

The data is public and the checks are mechanical, but they are spread across
several sites, and the useful answer depends on *your* squad. So it gets done
by hand, daily, badly, and often too late.

## The solution

A pipeline that does the checking and only speaks up when something matters.

1. **Watch** — sync the FPL API on a schedule; keep a snapshot per run.
2. **Detect** — diff each snapshot against the previous one: prices,
   status/injury flags, news text, ownership moves.
3. **Decide** — score the changes. Is it a confirmed change or an estimate?
   Does it affect a widely owned player, or one of *my* 15?
4. **Deliver** — one webhook fires only when there is something to say;
   Telegram gets the report, X gets a draft.
5. **Explain** — before each deadline, a preview of captains, differentials,
   fixture swings and congestion, written from numbers the code computed.

Every number is calculated in TypeScript with unit tests behind it. The AI
step writes short prose around the computed facts — it never calculates, never
ranks, and never invents a statistic. Forward-looking numbers are labelled as
estimates.

## Architecture

```
  FPL public API                football-data.org
  (bootstrap-static,            (Champions League
   fixtures, event/{gw}/live,    fixture dates only)
   entry picks)                        |
        |                              |
        +--------------+---------------+
                       v
        GitHub Actions cron  ->  jobs/  (TypeScript)
                       |
                       |  snapshot + diff + score
                       v
                   Supabase  (Postgres + read-only views)
                       |
        +--------------+---------------------+
        |                                    |
   ONE webhook per run                  Next.js on Vercel
   (only when it matters)               - public pages
        |                               - share images for X
        v                               - /api/telegram bot route
    Make.com (2 scenarios)
        |
        +-- Scenario 1: events   -> router -> Telegram channel
        |                                  -> X draft to me
        +-- Scenario 2: preview  -> Gemini -> Telegram -> Supabase
```

Sync failures skip Make entirely and alert Telegram straight from code, so an
alert still arrives when the automation layer is the thing that broke.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Scheduling | GitHub Actions cron | 2,000 free minutes/month on a private repo |
| Jobs | TypeScript, run with `tsx` | Testable logic, strict types, Zod at every boundary |
| Database | Supabase (Postgres) | Free tier, SQL views, row-level security |
| Automation | Make.com free plan | 1,000 credits/month, 2 scenarios — routing only |
| AI text | Gemini API free tier | Writes prose from computed facts, nothing else |
| Web | Next.js on Vercel Hobby | Free hosting, cached pages, API routes |
| Fixtures (Europe) | football-data.org free tier | Champions League dates for the congestion flag |
| Delivery | Telegram Bot API | Free, instant, no approval process |

Full limits and the budget arithmetic live in [CLAUDE.md](CLAUDE.md).

## How it works

**Every day, after the FPL price change**
The sync job fetches `bootstrap-static` once, pulls per-gameweek stats in a
single `event/{gw}/live` call, and writes a snapshot. It diffs against
yesterday, computes form, xGI/90, minutes risk, fixture difficulty, goal
threat and price pressure, and — if anything is worth saying — posts one
batched webhook. Telegram gets a price report with full player cards; an X
draft arrives for manual posting. If the job fails, Telegram says so directly.

**Before each gameweek deadline**
A second job assembles the facts — captain scores, differentials, fixture
swings, congestion flags — and sends them to the preview scenario. Gemini
turns the facts into short prose, Telegram receives it, and it is saved back
to Supabase so the web app can serve it without another AI call.

**Any time**
The website reads from Supabase views only. Visitors never trigger an AI call
or a third-party API request. `/my-team` is the sole live FPL lookup, cached
per team ID per gameweek and rate-limited per IP.

## Setup

> Setup is written out as each phase lands. The outline:

1. Clone the repo, `pnpm install` (Node 22+, pnpm 10+).
2. Copy `.env.example` to `.env` and fill in your own values.
   Every variable says where it comes from and which part uses it.
3. For local development, `pnpm db:start` (needs Docker) then
   `pnpm load:samples` to fill the database from the recorded API responses.
4. For the hosted project: `pnpm supabase login`, `pnpm supabase link
   --project-ref <ref>`, `pnpm supabase db push`, then set
   **Project Settings > API > Exposed schemas** to `api` only.
   See [docs/database.md](docs/database.md).
5. Import the blueprints from `make/blueprints/` into Make, reconnect Telegram
   and Gemini, and copy the two webhook URLs into your environment.
6. Add the job secrets to **GitHub Secrets** and the web secrets to **Vercel
   environment variables**. Nothing real is ever committed to this repo.
7. Create a Telegram bot with @BotFather and point its webhook at
   `/api/telegram` on your deployment, using your webhook secret.

## Roadmap

| Phase | What |
| --- | --- |
| **0** | Scaffold — repo layout, CLAUDE.md, ADRs, env template ✅ |
| **1** | API exploration + Zod schemas + recorded samples ✅ |
| **2** | Database schema + insight views ✅ |
| **3** | Sync and change detection on GitHub Actions |
| **4** | Insight engine (form, xGI/90, minutes risk, fixtures, captain score) |
| **5** | Make: daily report |
| **6** | Make: gameweek preview with Gemini |
| **7** | Web app + landing page |
| **8** | My-team, Telegram bot, quota guards |
| **9** | Launch — demo video, X thread |

---

Not affiliated with the Premier League or Fantasy Premier League. Uses public
data only, with its own branding and visuals.
