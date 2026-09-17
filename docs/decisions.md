# Architecture Decision Records

Short records of decisions that are expensive to reverse. One entry per
decision, newest at the bottom. Anything structural gets an entry.

## Template

```markdown
## ADR-000N — Title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by ADR-000M

### Context
What forced a decision. Constraints, limits, what we knew at the time.

### Decision
What we chose, in one or two sentences.

### Consequences
What this makes easy, what it makes harder, what we now have to live with.

### Alternatives considered
What else was on the table and why it lost.
```

---

## ADR-0001 — Bulk sync in code, routing in Make

- **Date:** 2026-09-17
- **Status:** Accepted

### Context

Make.com's free plan gives 1,000 credits per month and 2 active scenarios,
and charges one credit per module execution. An iterator over N records
charges N times for every module downstream of it. A single daily run that
loops over ~700 FPL players inside Make would exhaust a month of credits in
one morning.

Meanwhile the actual work — fetching, snapshotting, diffing, scoring — is
ordinary data processing that is far easier to test in TypeScript than in a
visual builder.

### Decision

All fetching, diffing and decision-making happens in `jobs/` (TypeScript, run
by GitHub Actions). Make receives **one webhook per run with an already
batched, already formatted payload** and does only what it is genuinely good
at: routing to channels and delivering messages.

### Consequences

- Credit usage becomes roughly constant per run instead of scaling with the
  number of players: ~120 credits/month for daily reports, ~25 for previews.
- The insight engine is unit-testable and version-controlled, and it runs
  locally without touching Make at all.
- Make becomes a thin, replaceable delivery layer — swapping it for direct
  Telegram calls later would not touch any business logic.
- The trade-off is less visual, less "no-code" in the portfolio story, and any
  formatting change means a code change and a commit rather than a drag in the
  Make editor.
- Standing rule: if a proposed Make change multiplies module executions by the
  number of players, it belongs in `jobs/` instead.

### Alternatives considered

- **Do the whole pipeline in Make.** Rejected: dies on credits, near-impossible
  to unit test, and the logic would be trapped in a vendor UI.
- **Skip Make, call Telegram directly from code.** Tempting and cheaper, but
  Make earns its place for the Gemini step, the X drafting branch and future
  channels without new code — and demonstrating an automation platform is part
  of the point of the project.

---

## ADR-0002 — X posts drafted automatically, published manually

- **Date:** 2026-09-17
- **Status:** Accepted

### Context

Posting to X requires write access to the X API, which is a paid product. The
project has a hard constraint of free tiers only. Publishing to X is still
valuable: it is the natural distribution channel for FPL content and part of
the portfolio story.

### Decision

The pipeline generates a ready-to-post draft (text, and later a share image
from the web app) and delivers it to me on Telegram. I copy and post it
myself. A record of each draft is stored in Supabase.

### Consequences

- Stays inside the free-tier constraint without dropping the feature.
- Adds a human step, so the system is not fully autonomous — drafts can go
  unposted, and posting time depends on me being awake.
- Because intent is recorded in the database, the pipeline is still auditable:
  what *would* have been posted, and when, is queryable.
- A brief human review before anything public goes out is a genuine safety
  benefit while AI-written text is involved.
- Upgrading later is small: a paid X connection becomes one extra Make module
  on the existing draft branch; the drafting logic does not change.

### Alternatives considered

- **Unofficial or scraped posting.** Rejected: against X's terms, fragile, and
  not something to put in a portfolio.
- **Drop X entirely and publish only to Telegram.** Rejected: loses the
  highest-reach channel and the share-image feature that goes with it.

---

## ADR-0003 — Telegram bot handled by a Next.js route, not a separate service

- **Date:** 2026-09-17
- **Status:** Accepted

### Context

The bot needs to answer commands on demand (squad report, player lookup). The
options are a long-running process that polls `getUpdates`, or a webhook
endpoint Telegram calls. A long-running process needs somewhere free to run
continuously — and free hosts that sleep would drop commands. The web app is
already deployed on Vercel and already has Supabase access.

### Decision

Telegram's webhook points at `/api/telegram` in the existing Next.js app on
Vercel. No separate service, no separate deploy, no additional hosting
account.

### Consequences

- Zero extra infrastructure; one deploy pipeline and one place to look at logs.
- Authentication is the `setWebhook` secret token, verified against the
  `X-Telegram-Bot-Api-Secret-Token` header, instead of an open endpoint.
- The function is subject to cold starts and the Hobby execution time limit, so
  the route must answer quickly and defer anything slow. In practice this is
  fine because the bot answers **from the database only** (see CLAUDE.md §7) —
  no live FPL calls, no Gemini, plus a per-user cooldown.
- Vercel Hobby is non-commercial, so this hosting choice is one of the things
  that must be revisited before charging for the product.

### Alternatives considered

- **Polling worker on a free container host.** Rejected: free tiers sleep or
  expire, it is a second thing to deploy and monitor, and polling wastes
  requests to do nothing most of the day.
- **A Supabase Edge Function.** Reasonable, and closest to the data — but it
  splits the codebase across two deploy targets for a handful of handlers that
  the web app can serve with code it already shares.
