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

## ADR-0012 — The co-pilot acts on a plan; five questions per account, for life

### Context

The co-pilot could only look things up and explain. Managers expect a
manager: "pick my XI", "captain Salah", "bring in a midfielder" should change
the team, not produce advice to copy by hand. At the same time the agent key
is small, so a daily allowance of 10 per account was more than it can carry.

### Decision

- **Action tools change a DRAFT, never FPL.** `pick_best_xi`, `change_lineup`
  and `make_transfer` edit a team plan (`packages/shared/src/plan.ts`):
  lineup, bench order, captaincy and transfers relative to the real squad.
  Armband still only reads FPL and never asks for a password.
- **Code decides what is legal and what is best.** The XI is chosen by an
  exhaustive search over legal formations on FPL's expected points; the
  lineup rating out of 10 is the XI's expected points against the best XI the
  same 15 can field (`insights/lineup.ts`). Every change is validated by
  `lineupProblems` and `checkTransfer` before it reaches the pitch. The model
  decides *which* action to take and explains it; it computes nothing.
- **The pitch shows the plan with Apply / Revert.** An applied plan is kept in
  the browser per team and gameweek, and sent with the next question so the
  co-pilot continues from it. The manager makes the changes in the FPL app.
- **Five questions per account, for life** (`api.consume_question()`), counted
  only when an answer completes. Questions outside FPL get one fixed reply
  (`OFF_TOPIC_REPLY`) with no tools, and are never counted.
- **Cheaper questions:** the squad snapshot travels with the question (no
  lookup turn), at most 6 turns and $0.02 per question, answers under 120
  words, and 4 earlier turns of history.

### Consequences

- The demo shows the agent acting: its four questions pick an XI, rate the
  lineup, make a transfer and check injuries, recorded once per gameweek.
- A plan lives in one browser. Moving it across devices would need a table;
  not worth it until accounts ask for it.
- Anyone can make several accounts for more questions. The service-wide daily
  spend cap and the key's own limit bound the total.

### Alternatives considered

- **Writing to FPL.** Needs the manager's FPL password; never.
- **Letting the model pick the XI.** Cheaper to build, but it would be the
  model computing a number — the one thing it may not do.
- **A daily allowance.** Fairer to heavy users, but unaffordable on this key.

## ADR-0013 — The free allowance belongs to the email, not the account

### Context

Five questions per account, for life (ADR-0012), were counted in
`app.agent_usage`, which is deleted with the account. Deleting an account and
signing up again with the same email therefore reset the allowance.

### Decision

- The lifetime count lives in `app.question_ledger`, keyed by a **fingerprint**
  of the email: HMAC-SHA256 of the normalised address with a random secret
  generated inside the database (`app.ledger_key`). It survives deletion; the
  address itself does not.
- Normalisation folds case, a `+tag`, and the dots Gmail ignores, so obvious
  aliases share one allowance.
- Users cannot read or change the ledger: both tables are deny-all, and two
  `security definer` functions in `app` add one to the caller's own row or read
  it. `api.consume_question()` and `api.my_usage_total` keep their shapes, so
  the website did not change.
- The privacy page, FAQ and Settings say exactly what is kept.

### Consequences

- Re-registering the same address no longer resets anything (tested).
- A genuinely different address still gets five questions. No free product can
  prevent that; the service-wide daily budget and the key's own spend limit
  bound the total.
- Changing an account's email would start a fresh count. Email changes need a
  confirmation email we cannot send, so this is not reachable today.

### Alternatives considered

- **Keep the email after deletion.** Breaks the privacy promise.
- **A plain hash.** An unsalted hash of an email can be matched against lists
  of addresses; the keyed hash cannot without the database's secret.
- **Refuse deletion while questions are used.** Breaks the FAQ's promise.

## ADR-0014 — The Gaffer runs inside the website, on the Messages API

Supersedes the hosting part of ADR-0009.

### Context

The agent ran on the Claude Agent SDK in a Docker container on a free Hugging
Face Space, because the SDK's bundled program (about 294 MB) is over Vercel's
250 MB function limit. Hugging Face then made Docker Spaces paid. The free
alternatives either ask for a card or offer 0.1 CPU with a minute's cold
start. Measured locally, the Agent SDK path used about 370 MB at peak per
question.

### Decision

- **The Gaffer's loop is ours**, on the Anthropic TypeScript SDK
  (`@anthropic-ai/sdk`, about 24 MB) in `agent/src/gaffer.ts`: stream a turn,
  run the tool calls in code, send the results back, repeat. Tools, prompt,
  plans, limits and events are unchanged.
- **It runs in-process** in the website's `/api/agent` and `/api/demo` routes.
  `agent/` is now a library the website imports, like `packages/shared`.
- **`ANTHROPIC_API_KEY` is a server-only Vercel environment variable**
  (Sensitive, never `NEXT_PUBLIC_`). The shared secret and the agent URL are
  gone.
- Each tool's Zod schema yields its JSON Schema for the API **and** validates
  the model's arguments before the tool runs. The frozen system prompt and
  tool list are cached.
- The per-question budget is enforced from the token counts the API reports,
  priced in `agent/src/config.ts`.

### Consequences

- One service to deploy, no cold starts, no shared secret.
- The per-caller and daily counters are per server instance, so they are a
  best-effort backstop. The binding limits are the per-account allowance in
  the database (ADR-0013) and the key's own spend limit.
- The Agent SDK's built-in tools, sessions and MCP plumbing are no longer used;
  the Gaffer never needed them, since its tools are all ours.

### Alternatives considered

- **Render's free plan.** Keeps the Agent SDK, and fits in 512 MB, but 0.1 CPU
  and a minute's wake-up after 15 idle minutes.
- **Hugging Face PRO.** Breaks the free-tiers-only rule.

## ADR-0015 — cron-job.org triggers the jobs; GitHub's schedule is only a backup

### Context

GitHub Actions' `schedule` is best-effort. Ours ran up to six hours late, and
on 29 October 2026 it skipped price-sync's 03:17 and 06:17 runs and daily-sync
entirely. Late injury news defeats the point of intraday detection, and a late
daily-sync leaves the site and the channel a night behind.

### Decision

- **cron-job.org** (free) calls GitHub's `workflow_dispatch` API for
  price-sync, daily-sync and preview at the exact minute, with a fine-grained
  token that can only run this repository's workflows. The token lives only in
  cron-job.org.
- **price-sync has no GitHub schedule**: doubling its 8 runs a day would break
  the minutes budget.
- **daily-sync and preview keep GitHub's schedule as a backup.** A second run
  on the same day changes nothing — changes are deduplicated, the daily report
  is sent once, the preview once per gameweek.

### Consequences

- The jobs run on time; the backup keeps the nightly sync (and with it the
  Supabase keep-alive) alive if cron-job.org fails.
- If cron-job.org fails, price-sync stops until it is fixed; its failure email
  and the dead man's switch on daily-sync make that visible.
- The token expires (up to a year): renewing it is a calendar item.

### Alternatives considered

- **More frequent GitHub schedules.** Same unreliability, more minutes.
- **A Vercel cron.** Hobby crons run at most once a day.

## ADR-0016 — The Gaffer runs as five checks in code; the agent is switched off

*Date: 2026-11-06 · Status: accepted · Supersedes the live parts of ADR-0012, ADR-0013 and ADR-0014*

### Context

The Gaffer was a Claude agent (ADR-0014) with five questions per account
(ADR-0012). Its API key expired on 1 November 2026. Since then the dugout's
chat could not answer, and the demo replayed a frozen recording. Armband is
now positioned as free, open-source tools, and a five-question allowance does
not fit that.

Every number the agent gave already came from the tested engine in
`packages/shared` (lineup, captain score, transfer search and checks). The
model chose which tool to call and wrote the sentences around the result.

### Decision

- **The Gaffer is five checks computed in code**: best XI, rate my lineup,
  captain, find a transfer, injury check (`packages/shared/src/gaffer.ts`,
  `web/src/components/copilot/Gaffer.tsx`). Each one shows the numbers behind
  it. The ones that change the team return a `TeamPlan`, which the dugout draws
  on the pitch with Apply and Revert, exactly as the agent's plans were drawn.
- **Computed on the server at render time**, from the squad (already loaded)
  and the cached `player_cards` view. Transfer options for all fifteen players
  are computed up front, so the panel needs no API route. The market read only
  selects available players with minutes behind them, which keeps it under
  Next's 2 MB fetch-cache limit.
- **Options, not advice.** Transfer options are ranked by one number at a time
  (expected points, last four gameweeks, fixtures). The captain list shows the
  inputs to the score, and an ineligible player shows no score.
- **The agent stays in the repo, switched off.** `agent/`, `/api/agent`,
  `/api/demo` and the web chat component are kept. Both routes answer 410
  unless `GAFFER_AI=on` and `ANTHROPIC_API_KEY` are both set.
- **No limits.** The usage counter is gone from the dugout and settings. The
  question ledger is no longer written. Fingerprints recorded before this
  change stay, as the privacy page says.

### Consequences

- No model cost, no quota, and the same squad always gets the same answer.
- The demo now runs live on the demo team instead of replaying recordings.
- Usage: no new FPL calls; Supabase gains one cached read per dugout or demo
  render; Gemini, Make and football-data are unchanged; Claude goes to zero.
- Lost: free-form questions and prose answers. The checks only cover the five
  jobs.

### Alternatives considered

- **Renew the key, keep five questions.** It costs money on a free product,
  and a hard limit is a poor first impression.
- **Delete the agent.** It is working, tested code and a reference for turning
  the AI back on, so it stays, switched off.

## ADR-0017 — No accounts: the dugout opens by FPL team ID

*Date: 2026-11-06 · Status: accepted · Supersedes ADR-0008's account flow*

### Context

After ADR-0016 an account did one thing: remember a manager's FPL team ID,
which FPL already publishes. Accounts still carried every cost of having
users. Bots could sign up, because email confirmation is off. Password resets
need an email provider. Google sign-in needs maintaining. And we held personal
data we had to protect and explain. The goal is a well-known free FPL
assistant and stats hub on free tiers only, so the sign-up step was the
biggest barrier and the biggest liability.

Separately, each dugout render read that squad's rows from Supabase. On the
free plan's ~5 GB monthly egress, about a thousand active managers would have
used most of it.

### Decision

- **`/team`** finds a team by ID with the existing "Is this you?" check.
  **`/team/[id]`** is that team's dugout: the pitch, the Gaffer's checks and
  the squad check. It can be bookmarked and is kept out of search engines.
- **The chosen team is remembered in the browser only**
  (`web/src/lib/my-team.ts`). The header's **My team** opens it. Nothing about
  a visitor is stored on our side.
- **Removed:** sign-in, sign-up, onboarding, settings, the OAuth callback,
  sign-out and the session middleware (`proxy.ts`), which also saves a
  function run on every page request. The old routes redirect to `/team`.
  `/app` sends anyone still holding a session to their team once.
- **`lib/auth/server.ts` stays**, only for the switched-off `/api/agent`
  route (ADR-0016). Turning the agent back on would also need accounts back.
- **Shared reads, flat egress.** Squads, the Gaffer and its market all read
  ONE cached copy of every player card (`web/src/lib/cards.ts`, ~1.4 MB,
  under the fetch cache's 2 MB item limit), refreshed every 3 hours to match
  the pipeline. That's about 330 MB of egress a month at any traffic. No page
  reads per-team rows any more.
- **Longer FPL caching.** Picks are cached for a day, since a gameweek's
  picks are locked at its deadline and a new gameweek is a new URL. The
  entry summary is cached for 30 minutes.

### Consequences

- No sign-up and no personal data. Supabase holds only football data.
- Supabase egress and FPL calls stay roughly flat as traffic grows.
- A different device needs the team ID again, or the bookmarked link.
- Anyone can open any team. FPL makes every team public already, and our
  caching means repeat visits cost FPL nothing. A script looping through IDs
  would pass uncached calls through us; if that happens, we add a limit then.
- Existing account data was deleted the same day by
  `20261106134942_purge_accounts.sql`: logins, profiles, usage, the question
  ledger and the old waitlist. The tables stay, empty and unused, until a
  later migration drops them.

### Alternatives considered

- **Keep accounts, add a captcha and an email provider.** That fixes the bot
  and reset problems but keeps the personal data, the sign-up friction and
  more services to run.
- **Optional accounts for cross-device sync.** The bookmarkable `/team/[id]`
  link already does that job.

## ADR-0018 — Redesign: graphite, one volt accent, Geist, FPL difficulty colours

*Date: 2026-11-06 · Status: accepted · Replaces the "Stadium / Daylight" look*

### Context

Before the public launch on X, the site still read as generated, and it was
not simple to use:
- Green-tinted surfaces.
- Two accents: volt on dark, orange on light.
- Four type families.
- Slanted plates everywhere.
- Every tool page opened with a kicker, a two-tone headline and a paragraph.
- Charts each used their own colours.
- Stats had 14 filter chips.

The best football-stats products (FotMob, Sofascore) keep the chrome neutral
and let club colours and the data carry the colour.

### Decision

- **Tokens, not rewrites** (`web/src/app/globals.css`). Graphite surfaces in
  both themes. Three text roles. **One accent, volt**: on light it stays a
  volt fill with dark ink, and `--accent-text` (dark olive) for small text.
  Semantic colours are toned down. No washes, glows or floodlights.
- **One family:** Geist, with Geist Mono for figures. Bricolage and Barlow are
  gone, and the wordmark is "Armband" in Geist. Weights 400–600, sentence
  case, no italics.
- **Signature: FPL's own fixture difficulty colours** (1–5), on every fixture
  cell, the player page and the share card. Text colours come from
  `--fdr-ink-*` tokens.
- **Simple pages.** A tool page opens with its name and one line, and the
  tool comes before the insight charts. Chart explanations fold into "How
  it's calculated" (`components/charts/How.tsx`). Stats ranks by six common
  stats plus "More stats".
- **Header:** the mark, Stats · Fixtures · Prices · Players, player search on
  every page (a plain GET to `/players?q=`), the theme toggle and **My
  team**. Demo and GitHub moved to the menu and the footer.
- **The landing page keeps all its sections**, restyled. Only the numbering
  went.

### Consequences

- The look lives in tokens, so a later change is a token change.
- No logic or data changed; the production build and every page QA passed in
  both themes, on phone and desktop.
- The share card matches the site and needs no bundled font.

**Addendum (same day).**
- **The landing hero's action is a team ID box**
  (`components/landing/TeamIdBox.tsx`): type an ID or paste a Points page
  address, and **Open my team** goes straight to `/team/<id>`, which shows the
  team's name and "This is my team". The same box closes the page.
- **`/demo` is removed** and redirects to `/`. The hero already plays the demo
  team's best XI live, and anyone can open their own team, so a separate demo
  page was a detour. The landing page's Gaffer section links to an example
  team's real dugout instead.
- **Theme:** the phone or computer setting decides. With no setting, the site
  starts light.
- **On a phone, the fixtures grid fits all five gameweeks without scrolling.**


## ADR-0019 — Shareable cards, squad watch and the deadline countdown

*Date: 2026-11-06 · Status: accepted*

### Context

Armband grows only by word of mouth on X, and the plan is to post every
gameweek. The official FPL app shows numbers but makes nothing worth sharing.
The 3 S rule (simple, slightly addictive, sharable) asks for cards people want
to post and for reasons to come back.

### Decision

- **Cards are images rendered by code.** Each card is drawn with `next/og` at
  1200×630, which X, Telegram and WhatsApp all show uncropped. It is served at
  a stable address, `/cards/<card>/image.png`, revalidated every 30–60
  minutes. Each card has its own page, `/cards/<card>`, whose link preview is
  the card, so a shared link shows the picture and brings people to the site.
  `/cards` lists them all.
- **Every card carries the watermark:** the Armband mark, `armband.abdela.dev`
  and its data source. Shirts are drawn flat in club colours from our own kit
  table, never official kit images.
- **Sharing:** the phone's share sheet with the image itself (Web Share API,
  where supported), "Post on X" (an intent link to the card's page), and
  Download.
- **The first cards:**
  - the transfer radar (net transfers in and out this gameweek)
  - the template XI (the most-owned legal XI, filled greedily by ownership
    under FPL's formation rules)
  - tonight's price watch (labelled an estimate; 100% is never shown as a
    confirmed change)

  The selections are pure functions in `packages/shared/src/cards.ts`, with
  tests.
- **Your team page gains "Tonight" and "Since your last visit"**
  (`packages/shared/src/squad-watch.ts`):
  - **Tonight:** your 15 players FPL has close to a price change.
  - **Since your last visit:** compares the squad with a snapshot kept in the
    browser only. A new baseline is taken once the last visit is three hours
    old.
- **A deadline countdown** on the landing page and the team page, from
  `fixture_ticker.deadline_utc`, using the first deadline still ahead.

### Consequences

- No new FPL calls. The cards read the same cached views as the tool pages, so
  their cost doesn't grow with how often they're shared.
- Image renders run on Vercel functions, cached by revalidation.
- Thresholds live in `INSIGHT_CONFIG.cards` and `INSIGHT_CONFIG.squadWatch`.

## ADR-0020 — Gameweek wrapped and player compare

*Date: 2026-11-06 · Status: accepted*

### Context

ADR-0019's cards are public. The most shared FPL posts are personal ("my
gameweek") and comparisons ("Saka vs Palmer"). The official app shows the raw
numbers for both, but nothing that tells the story or is easy to post.

### Decision

- **Gameweek wrapped** (`/wrapped/<team id>`, card at `/wrapped/<id>/image.png`).
  It shows:
  - FPL's gameweek points after hits, against FPL's average
  - the captain's return, against the best captain in the XI (hindsight, not
    advice)
  - points left on the bench, transfers and hits
  - overall rank and its move since last gameweek

  The logic is `gameweekWrapped` in `packages/shared/src/wrapped.ts`. A live
  gameweek is labelled "points so far". FPL reports an average of 0 until a
  gameweek is scored; that is shown as unknown.
- **New data:**
  - `entry/{id}/history/` (`fetchSeason`, cached 30 minutes per team) for last
    gameweek's rank and, later, the chips used.
  - `Squad` gains bench points, transfers and their cost from the picks it
    already loads.
  - **A new view, `api.gameweeks`**, exposes FPL's average score. It's the
    twelfth owner-privileged `api` view (the accepted Security Advisor finding
    grows from eleven to twelve).
- **Player compare** (`/compare?p=a,b,c`, card at `/compare/image.png?p=…`).
  Up to three players on a radar chart. The six axes are points, form, xGI per
  90, goals and assists, minutes and points per £m. Each axis is a percentile
  among outfield players with at least 270 minutes, so the scales match. The
  raw numbers, ownership and the next five fixtures in FPL's difficulty
  colours sit beside the radar. The logic is `comparePlayers` in
  `packages/shared/src/compare.ts`; the radar is hand-built SVG, with no new
  dependency.

### Consequences

- FPL calls: wrapped adds at most one `history` call per team per 30 minutes;
  compare adds none.
- The migration must be pushed before wrapped shows the average. Without it,
  the card still renders, without the comparison.

## ADR-0021 — Mini-league spy, chip planner, fixture swings and best XI cards

*Date: 2026-11-06 · Status: accepted*

### Context

The paid FPL tools win on mini-leagues and planning. Armband is free, so these
had to be built within FPL politeness and the free tiers.

### Decision

- **Mini-league spy** (`/league`, `/league/<id>?me=<team>`, card at
  `/league/<id>/image.png`). It shows:
  - the league's first page of standings (`leagues-classic/{id}/standings/`,
    cached 30 minutes)
  - **up to 20 rival teams from the top**
    (`INSIGHT_CONFIG.league.rivals`), read 5 at a time
  - this gameweek's captains and chips, and the most-owned players
  - with `me`, **your differentials** (owned by at most 25% of the rivals
    read) and **the players at least half of them own that you don't**

  Shares are always out of the teams actually read, and the page says how
  many. The current gameweek comes from FPL's own entry response, with our
  database as the fallback. The logic is `leagueSpy` in
  `packages/shared/src/league.ts`.
- **"Your leagues" on the team page**, from the entry FPL already returns. It
  lists private leagues only (FPL's system leagues have millions of entries),
  smallest first.
- **Chip planner on the team page.** It lists the chips played (from
  `entry/{id}/history`) and, for each of the next five gameweeks, how many of
  the 15 play, have a double or blank, plus the XI's average FPL difficulty.
  It describes the facts, never makes a call; FPL's rules decide which chips
  are left. The logic is `chipWeeks` and `chipsUsed` in `chip-planner.ts`.
- **Two public cards:**
  - **Fixture swings**, from the fixtures page's own swing logic.
  - **The gameweek's best XI**, the highest-scoring legal XI of the latest
    gameweek, from `api.player_gameweeks`.

  The template XI and the best XI now share one tested function:
  `bestXiBy(rows, value)`.
- **FPL requests retry once** after a dropped connection or a timeout; HTTP
  error answers are never retried.

### Consequences

- A league costs FPL at most 1 standings call and 21 picks calls (20 rivals
  plus you) the first time. Picks are cached for a day, because they never
  change after a deadline, so later views are free.
- Leagues are shown from public FPL data only, and their pages are kept out of
  search engines.

## ADR-0022 — Anonymous page counts with Vercel Web Analytics

*Date: 2026-11-06 · Status: accepted*

### Context

After the X launch we need to know which tools people use and where they come
from. The privacy promise is no cookies, nothing that identifies a visitor,
and no paid services.

### Decision

- **Vercel Web Analytics** (`@vercel/analytics`, the only new dependency) via
  `web/src/components/site/SiteAnalytics.tsx` in the root layout.
  - No cookies.
  - The Hobby plan includes 50,000 events a month and pauses collection when
    the limit is reached, rather than charging.
  - Counting visits ourselves in Supabase was rejected: it adds a write per
    visit and breaks "visits cost nothing".
  - Cloudflare Web Analytics was rejected: it limits sites not proxied through
    Cloudflare, and it's a second dashboard.
- **Every page is counted.** Addresses with a personal ID are grouped
  (`/team/[id]`, `/league/[id]`, `/wrapped/[id]`), and query strings are
  dropped. The dashboard shows which tools are used, never whose team.
- **Nothing is shown on the site for now:** small launch-week numbers make
  poor social proof. Revisit once the numbers are worth showing.
- The privacy page says what is counted and by whom.

### Consequences

- You turn it on in Vercel: Project → Analytics → Enable.
- If traffic ever passes about 50,000 page views a month, collection pauses
  until the next month. Nothing on the site breaks.

## ADR-0023 — Search engines: sitemap, robots, canonical addresses, structured data

*Date: 2026-11-07 · Status: accepted*

### Context

The site had no `robots.txt`, no sitemap, no canonical addresses and no
structured data, so search engines found it by chance. Each of the 670 player
pages answers a real search ("<player> FPL stats").

### Decision

- **`app/robots.ts`:** crawl everything public. Keep `/api/` and personal pages
  (`/team/`, `/league/`, `/wrapped/`, already marked noindex) out. Point to the
  sitemap.
- **`app/sitemap.ts`:** every public page and every player page, from
  `api.player_current` (cached a day). Players who have played get the higher
  priority.
- **A canonical address on every public page**, so query-string variants never
  split ranking.
- **Structured data on the landing page:** a `WebSite` with a `SearchAction`
  into the player search, and a free `WebApplication`.
- **Player page titles match how people search:** "<player> FPL stats: points,
  xG, price and fixtures".

### Consequences

- No new services and no new data reads beyond the cached player list.
- To finish: verify the domain in Google Search Console and submit
  `/sitemap.xml`; Bing Webmaster Tools can import it from Google.
