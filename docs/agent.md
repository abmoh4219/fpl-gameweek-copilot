# The Gaffer

How the Gaffer, Armband's agent, works: what it can do, where it runs, what
it may spend, and how it stays honest. Decisions behind it: ADR-0012 (actions
and limits), ADR-0013 (the allowance), ADR-0014 (running it on Vercel).

## In one paragraph

A manager asks in plain English. The Gaffer — Claude Haiku 5.5 on the
Messages API, with a tool loop we own — sees a snapshot of their squad and
works through read-only tools and three **action** tools. Code computes every number and checks every rule;
the model decides what to do and explains it. When it changes the team, the
change appears on the manager's pitch as a **plan** they apply or revert,
then make in the FPL app. Armband never writes to FPL.

## Where it runs

```
 browser ──POST /api/agent──▶ Vercel route (Next.js)
   ▲   (question, history,     │ checks the account and its allowance
   │    applied plan)          │ loads the squad from FPL (cached)
   │                           │ runGaffer(): Claude ⇄ our tools, in-process
   │                           │ counts the question on "done"
   └──────── NDJSON events ◀───┘
```

- **One service.** The loop lives in `agent/src/gaffer.ts` and runs inside the
  website's route, so there is no second server, no shared secret and no cold
  start.
- **`ANTHROPIC_API_KEY` is a server-only Vercel variable.** The browser never
  sees it, nor the cost of an answer.
- The model has **only our tools**: no shell, files or web. Each tool's Zod
  schema becomes its JSON Schema for the API *and* validates the model's
  arguments before the tool runs.
- **Each turn streams**: text deltas go straight to the browser; tool calls run
  in code, in parallel, and their results go back as one message.
- **The frozen prompt and the tool list are cached** (`cache_control` on the
  system prompt); the squad snapshot and the question come after it.

## Tools

| Tool | Kind | What code does |
| --- | --- | --- |
| `get_player`, `compare_players` | read | Computed player cards |
| `search_players` | read | Filter and rank the market, excluding the squad |
| `get_fixture_runs` | read | Club fixture runs adjusted for opponent strength |
| `get_price_watch`, `get_preview` | read | Price-change estimates; the stored gameweek preview |
| `check_transfer` | read | FPL's rules: positions, 3 per club, bank |
| `rate_lineup` | read | Score out of 10: XI expected points vs the best XI the same 15 can field |
| `highlight_players` | pitch | Light players up while answering |
| `pick_best_xi` | **action** | Exhaustive search over legal formations on FPL's expected points |
| `change_lineup` | **action** | Start, bench, captain, vice — validated by `lineupProblems` |
| `make_transfer` | **action** | Validated by `checkTransfer`; the new player takes the old one's place |

Action tools edit a **draft** (`TeamPlan`, `packages/shared/src/plan.ts`) that
starts from the manager's applied plan, or from FPL as-is. Each committed
change is sent to the browser as a `plan` event with the changes in plain
words, so the agent and the website describe a plan identically.

The squad snapshot travels with every question, so the model never spends a
turn fetching it.

## Events

One JSON object per line (`packages/shared/src/agent-protocol.ts`):
`tool_call`, `tool_result` (a summary written by code), `highlight`, `plan`,
`text`, `done` (with `remaining` and `offTopic`), `error`.

## Staying honest

- Every number must come from the snapshot or a tool result. The prompt says
  so, and the tools give the model nothing else to quote.
- Ratings, expected points, fixture runs and price moves are labelled as
  estimates every time.
- Questions outside FPL get one fixed sentence (`OFF_TOPIC_REPLY`) with no
  tools, and are never counted.
- A plan the pitch cannot draw — an unknown player, or a captain on the
  bench — is ignored rather than shown.

## Limits and cost

| Guard | Value |
| --- | --- |
| Questions per account | 5, for life — counted only when an answer completes, and kept per email fingerprint so deleting and re-registering does not reset them (ADR-0013) |
| Per question | 6 model turns, $0.02 — priced in code from the tokens the API reports |
| Per server instance | $0.50 and 10 questions per caller, per UK day — a best-effort backstop |
| Demo | 4 answers recorded once per gameweek, replayed to everyone |
| Hard ceiling | the key's own spend limit (Anthropic Console) |

Anonymous visitors never start a run. All limits live in `AGENT_LIMITS`; the
account limit is enforced in SQL by `api.consume_question()`, and a test keeps
the two equal.

## Testing

- `packages/shared/test/` — lineup picking, rating, legality and plans.
- `agent/test/tools.test.ts` — every tool, against a synthetic squad, with no
  model and no network.
- `agent/test/gaffer.test.ts` — the loop itself, against a scripted Claude:
  tool round-trips, caching, invalid arguments, off-topic, the turn limit and
  pricing.
- `jobs/test/accounts.test.ts` — the allowance, through the real database.
