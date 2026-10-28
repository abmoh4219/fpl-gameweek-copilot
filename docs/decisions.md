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

---

## ADR-0004 — `@fpl/shared` ships TypeScript source, with no build step

- **Date:** 2026-09-22
- **Status:** Accepted

### Context

`packages/shared` holds the Zod schemas, the team map and (from Phase 4) the
insight engine. Both `jobs/` and `web/` import it. A shared workspace package
normally needs a compile step so consumers can import built JavaScript, which
means a `dist/`, a watch mode during development, and a build ordering
constraint in CI before anything can be typechecked or tested.

Everything that consumes this package already understands TypeScript: `tsx`
runs the jobs, Vitest transforms on the fly, and Next.js compiles workspace
packages when they are listed in `transpilePackages`.

### Decision

`@fpl/shared` exposes its source directly — `"exports": { ".": "./src/index.ts" }`
— and has no build script. `tsc` runs in `--noEmit` mode purely as a
typechecker.

### Consequences

- No `dist/`, no stale build, no build ordering in CI. Editing a schema is
  immediately visible to `jobs/` and the tests.
- CI is simply typecheck plus test, which keeps Actions minutes low (§4).
- `web/` **must** list `@fpl/shared` in `transpilePackages` in Phase 7, or the
  Next.js build will fail on a `.ts` import. That is the one thing this
  decision makes easier to get wrong.
- Relative imports inside the package carry explicit `.ts` extensions, which
  needs `allowImportingTsExtensions` in the tsconfig. Harmless under `noEmit`.
- If the package is ever published outside this monorepo, it will need a real
  build. It is private and workspace-only, so that is not a cost today.

### Alternatives considered

- **A `tsc` build emitting `dist/`.** The conventional answer, and the right
  one for a published library. Here it buys nothing and adds a build step to
  every test run and CI job.
- **A bundler (tsup/unbuild).** Same cost, plus a dependency, to solve a
  problem the consumers do not have.

---

## ADR-0005 — Jobs write over a direct Postgres connection, not the Data API

- **Date:** 2026-09-22
- **Status:** Accepted

### Context

The security model puts every table in a private `core` schema and exposes
only `api` (read-only views) through the Data API. Phase 2 was planned around
`@supabase/supabase-js` for the loaders, on the assumption that the service
role key would still reach `core` over HTTP.

It does not. PostgREST refuses any schema that is not in the exposed list,
whoever is asking:

```
PGRST106  Invalid schema: core
hint: Only the following schemas are exposed: api
```

That is the security model working correctly, not a misconfiguration. The
options were to expose `core` and rely on grants to keep `anon` out, or to stop
using the Data API for writes.

### Decision

Jobs connect **directly to Postgres** with `postgres` (postgres.js), using
`SUPABASE_DB_URL`. `core` stays unexposed. The Data API remains read-only and
public-facing.

### Consequences

- The "core is not reachable over HTTP" property is absolute, and the test
  suite asserts it for the service role as well as `anon`.
- Batched multi-row upserts go over one SQL statement per table instead of a
  PostgREST round trip, which suits a cron job loading ~700 rows a table.
- A new environment variable, `SUPABASE_DB_URL`, and a new dependency,
  `postgres`. It replaces `@supabase/supabase-js` in `jobs/`, which is no
  longer needed there at all.
- Jobs cannot run anywhere the database is unreachable, so the connection
  string has to be a GitHub Secret rather than a public URL and anon key.
- The website still uses the Data API with the anon key, as intended — so the
  two halves of the system authenticate in completely different ways, which is
  the point.

### Alternatives considered

- **Expose `core` and rely on grants alone.** Rejected: it makes a REST
  endpoint exist for every private table, defended only by grants and RLS
  policies. One mistaken `GRANT` would publish the lot.
- **A `security definer` RPC per table.** Keeps writes on the Data API, but
  means hand-writing and maintaining a function per table to do what `INSERT
  ... ON CONFLICT` already does.

---

## ADR-0006 — Delivery: pre-rendered batches to Make, intraday news alerts with a cap

- **Date:** 2026-10-23
- **Status:** Accepted

### Context

Phase 5 connects the stored reports to Telegram through Make. Make's free plan
is 1,000 credits a month, charged per module execution, and our own ceiling is
~400 (CLAUDE.md §4). Separately, price-sync already detects injury news
intraday, but nothing delivered it — and the daily report read only events
with `occurred_on = today`, so Friday-afternoon news never reached any report.

### Decision

- `jobs/` renders and splits every Telegram message, and POSTs **one** JSON
  payload per delivery: `messages[]`, `xDraft`, and a shared `secret` that
  Make's first filter checks. Make routes only: webhook → filter → router →
  (iterator → channel) and (X draft → owner's chat).
- The daily report is delivered only when it has a price or status change,
  at most once per UK day.
- price-sync sends a **news alert** for undelivered status and news events
  with importance ≥ 90, at most **2 per UK day**, newest 24 hours only.
- The daily report covers status and news events detected **since the
  previous daily report**, so it is a complete recap whether or not an alert
  went out.
- `notified_at` is set when Make answers 2xx. Every attempt is logged in
  `core.deliveries`, which also backs the cap.

### Consequences

- Credits: daily report ~4-5 a run (~150/month), news alerts ~3 each with a
  hard ceiling of ~180/month, preview ~25. Worst case ~355, under 400.
- Make never loops over players, so a busy night costs the same as a quiet one
  apart from one extra message per 4,000 characters.
- A news alert's players reappear in the next daily recap. Deliberate: the
  recap is the record of the day, and the website renders it.
- "Accepted" means Make queued the run, not that Telegram delivered it. A Make
  failure after that point is visible in Make's history but not in ours.
- No retry on a failed POST — a timeout after success would double-post to a
  public channel. Undelivered events wait for the next run instead.
- Delivery failures never fail the run (the data is stored; failing would trip
  the dead man's switch) but alert Telegram directly, with a 6-hour cooldown.

### Alternatives considered

- **Send to Telegram from code and drop Make.** Fewer moving parts, but the
  architecture keeps Make as the routing layer (ADR-0001), and Scenario 2
  needs it for Gemini anyway.
- **One webhook per event.** Rejected outright: credits scale with players.
- **Confirm delivery with a Make webhook-response module.** One more credit
  per run to learn something Make's own history already shows.
- **Deliver news only in the daily report.** Simplest, but news detected on
  Friday afternoon would arrive after a Friday-evening deadline.

---

## ADR-0007 — Gemini prose comes back to code before anything is published

- **Date:** 2026-10-23
- **Status:** Accepted

### Context

The preview gets a short AI-written opening paragraph (Phase 6). The hard rule
in CLAUDE.md §2 is that Gemini never calculates, never ranks and never
introduces a number that was not passed in. The original plan,
"Scenario 2: preview → Gemini → Telegram → Supabase", would publish the
model's text before anything could check it, so the rule would be a request
in a prompt rather than something enforced.

### Decision

- The preview job POSTs the computed facts and a prompt to Scenario 2:
  *webhook → filter → Gemini → Webhook response*. Make answers the same HTTP
  request with Gemini's text.
- Code validates the text in `validateProse()`: length, no links, markdown
  stripped, and **every number must appear in the facts**. It is
  HTML-escaped, and a fixed "estimate" label is added by code.
- Valid prose becomes `payload.prose` and `generated_by = 'ai'`. On any
  failure, rejection or the daily cap (3 calls), the template preview ships.
- The finished preview goes out through **Scenario 1**, like every other
  report.
- The prompt lives in `packages/shared/src/reports/ai.ts`, versioned and
  tested, not in a Make module.
- A daily `preview` workflow sends each gameweek's preview once, when the
  deadline is within 36 hours.

### Consequences

- The no-invented-numbers rule is enforced by a unit-tested function, not by
  trusting a model. Invented arithmetic (two facts added together) is
  rejected too.
- The check is deliberately strict: prose that writes "top 5" when 5 is not a
  fact is rejected, and the template ships. A false rejection costs some
  prose; a false acceptance would publish an invented statistic.
- Credits per preview rise to ~8 (3 in Scenario 2, ~5 in Scenario 1), about
  40 a month. The worst case across all scenarios is ~370, under the 400
  ceiling.
- Telegram, the X draft and the audit trail stay in one scenario, and the free
  plan's second scenario slot does nothing but Gemini.
- Validation checks numbers, not names or claims. A sentence can still be
  wrong in words ("Arsenal are in great form"), which is why the label calls
  it AI-written and the computed sections follow it.

### Alternatives considered

- **Gemini → Telegram inside Make** (the original plan). Rejected: nothing
  can enforce the rule between the model and a public channel.
- **Call the Gemini API from `jobs/` directly.** Simpler, but it moves the key
  out of Make and leaves the second scenario unused. The webhook response
  keeps code in control at the cost of one module.
- **Validate inside Make with filters.** Make filters cannot extract and
  compare every number in free text.

---

## ADR-0008 — The website renders published data; user rows live in an `app` schema

- **Date:** 2026-10-28
- **Status:** Accepted

### Context

The website needs player cards and fixture runs computed by the insight
engine, and its first user-scoped table (the waitlist). CLAUDE.md requires
that code computes every number in one place, that visitors never trigger
expensive work, that `anon` has zero privileges on `core`, and that per-user
rows use RLS policies with `security_invoker` views.

### Decision

- `price-sync` and `daily-sync` publish every player card (`core.player_cards`)
  and every team's 3- and 5-gameweek run (`core.team_runs`), upserted each run.
  The site reads them through owner-privileged views `api.player_cards`,
  `api.team_runs` and `api.previews`, and never runs the engine itself.
- User-scoped tables live in a third schema, **`app`**: RLS policies,
  column-level grants, and `security_invoker` views in `api`. The waitlist is
  INSERT-only for `anon` and can never be read back over the Data API.

### Consequences

- The site, Telegram and the agent can never disagree about a number.
- ~700 rows / ~0.7 MB, overwritten each run; no growth.
- Owner-privileged `api` views: now **ten** (the accepted Security Advisor
  finding). `api.waitlist` is `security_invoker` and must never be flagged.
- `core` keeps its "anon has nothing" property; tests assert it, and assert
  the waitlist rules from outside over HTTP.

### Alternatives considered

- **Compute cards in the website.** Needs team-strength views, duplicates the
  engine's inputs, and makes every page build a computation.
- **Waitlist in `core` with a grant for anon.** Breaks the zero-privilege rule
  that the whole security model rests on.

---

## ADR-0009 — The agent: Claude Agent SDK in a container, reached through the website

- **Date:** 2026-10-28
- **Status:** Accepted

### Context

A one-day challenge required an agent built with the **Claude Agent SDK**, on
a small demo API key, deployed publicly. The SDK runs the Claude Code native
binary as a subprocess (294 MB unpacked on linux-x64) and Anthropic's hosting
guide asks for ~1 GiB RAM per agent in a container. A Vercel function is
capped at 250 MB. This is also the first time a visitor can trigger a paid
model call, which CLAUDE.md §7 otherwise forbids.

### Decision

- The agent is its own workspace package, `agent/`, deployed as a **Docker
  Hugging Face Space** (free: 2 vCPU, 16 GB). Only a bundle — one JS file,
  `package.json`, `Dockerfile`, README — is uploaded; never this repo.
- The SDK runs with **`tools: []`** (no shell, files or web),
  `settingSources: []`, `persistSession: false`, auto memory off, our own
  system prompt, and nine read-only tools in an in-process MCP server. Tool
  logic is pure and tested in `packages/shared`.
- Model **Claude Haiku 5.5**. Caps: 5 questions per visitor per UK day, a
  $0.50/day service cap, `maxBudgetUsd` and `maxTurns` per question, and the
  key's own spend limit as the hard ceiling.
- The browser talks only to the website's `/api/agent`, which attaches the
  squad, hashes the visitor's IP, and forwards with a shared secret. The
  agent's URL and the Anthropic key never reach a browser.
- Every tool call is streamed to the UI as it happens (NDJSON), with a
  one-line summary written by code.

### Consequences

- Visitors CAN now spend money — bounded per visitor, per day and per
  question, with the key's spend limit behind all three. An exception to
  CLAUDE.md §7, deliberately scoped to this feature.
- Usage counters are in memory: correct for the single Space container, reset
  on restart. The key's spend limit is the backstop.
- A free Space sleeps after ~48 h idle and cold-starts in ~30 s; the UI says
  so if the agent does not answer.

### Alternatives considered

- **Tool runner in `@anthropic-ai/sdk` on Vercel.** Lighter and simpler, but
  the challenge required the Agent SDK.
- **Agent SDK on Vercel.** The binary alone exceeds the function size limit.
- **Render / Koyeb free tiers.** 512 MB RAM, below the hosting guidance.

---

## ADR-0010 — Official kits and club badges, loaded from source, until monetisation

- **Date:** 2026-10-28
- **Status:** Accepted

### Context

CLAUDE.md §8 said: no official Premier League or FPL logos, no club badges,
no player photos — our own visuals only. The owner wants the squad view to
look like the FPL app, with real kits, and club badges next to fixtures and
the table. Both are club and league artwork.

### Decision

- Kits load from FPL's own image server
  (`fantasy.premierleague.com/dist/img/shirts/standard/shirt_{code}-110.webp`,
  keepers `shirt_{code}_1-…`), keyed by the stable team `code`.
- Crests load from football-data.org's crest URLs.
- **Never copied into the repo or our storage.** Our own SVG shirt is the
  fallback when an image fails.
- Still no Premier League or FPL logos and no player photos; the product keeps
  its own name and branding.

### Consequences

- The squad view matches what managers know from the FPL app.
- If FPL or football-data block hotlinking or rename files, the fallback shirt
  shows — nothing breaks.
- **Must be replaced before charging money** (CLAUDE.md §8 now says so).

### Alternatives considered

- **Own artwork only.** Safe forever, less authentic; kept as the fallback.
- **Download and self-host.** Redistributes the artwork; worse than loading it.

## ADR-0011 — Self-service account deletion through one narrow elevated function

### Context

The FAQ promises managers can delete their account from Settings. Deleting a
login means deleting the caller's `auth.users` row, which a signed-in user
cannot do: until now nothing user-facing ran with elevated rights (ADR-0008).

### Decision

- `app.delete_user()` is `security definer`, `search_path = ''`, and does one
  thing: `delete from auth.users where id = auth.uid()`. It lives in `app`,
  which the Data API never exposes.
- `api.delete_my_account()` is a `security invoker` wrapper — the only thing
  the website calls. Execute is granted to `authenticated` only.
- Profiles and usage rows go with the login through `on delete cascade`.
- The website asks the manager to type "delete", and the server action
  checks it again before calling the function.
- Tests prove anonymous callers are refused and a user deletes only their
  own login (`jobs/test/accounts.test.ts`).

### Consequences

- No admin key on Vercel; the elevated surface is one auditable statement.
- After pushing, check the Security Advisor: the function is outside the
  exposed schema, so no new finding is expected (CLAUDE.md §4a). If one
  appears, it must be resolved, not accepted.

### Alternatives considered

- **A server route with the Supabase secret key** (`auth.admin.deleteUser`).
  Works, but puts the most powerful key in the website's environment for one
  button.
- **Soft delete** (clear the profile, keep the login). Breaks the FAQ's promise,
  and a kept login with a fresh profile would let someone reset their daily
  question count.
