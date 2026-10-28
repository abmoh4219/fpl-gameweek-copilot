# The Gaffer

How the Gaffer, Armband's agent, works: what it can do, where it runs, what it may spend,
and how it stays honest. Decisions behind it: ADR-0009 (hosting), ADR-0012
(actions and limits).

## In one paragraph

A manager asks in plain English. The agent — Claude Haiku 5.5 on the Claude
Agent SDK — sees a snapshot of their squad and works through read-only tools
and three **action** tools. Code computes every number and checks every rule;
the model decides what to do and explains it. When it changes the team, the
change appears on the manager's pitch as a **plan** they apply or revert,
then make in the FPL app. Armband never writes to FPL.

## Where it runs

```
 browser ──POST /api/agent──▶ Vercel route ──x-agent-secret──▶ Hugging Face Space
   ▲   (question, history,     │ checks account + allowance     │ Claude Agent SDK
   │    applied plan)          │ loads squad from FPL (cached)  │ + FPL tools (MCP)
   │                           │ counts the question on "done"  │
   └──────── NDJSON events ◀───┴───────────────────────────────◀┘
```

- **Why not on Vercel:** the Agent SDK ships a native binary of about 294 MB,
  over Vercel's 250 MB function limit. A free Docker Space runs it as one
  long-lived process, which also keeps the in-memory spend counters honest.
- The Space holds the only copy of `ANTHROPIC_API_KEY`. The website holds a
  shared secret, never the key; the browser holds neither.
- Built-in SDK tools are removed (`tools: []`): no shell, files or web. The
  model sees only our MCP server, `mcp__fpl__*`.

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
| Questions per account | 5, for life — counted only when an answer completes |
| Per question | 6 model turns, $0.02 |
| Service-wide | $0.50 per UK day |
| Per caller in the service | 10 per UK day (a backstop) |
| Demo | 4 answers recorded once per gameweek, replayed to everyone |
| Hard ceiling | the key's own spend limit (Anthropic Console) |

Anonymous visitors never start a run. All limits live in `AGENT_LIMITS`; the
account limit is enforced in SQL by `api.consume_question()`, and a test keeps
the two equal.

## Testing

- `packages/shared/test/` — lineup picking, rating, legality and plans.
- `agent/test/tools.test.ts` — every tool, against a synthetic squad, with no
  model and no network.
- `jobs/test/accounts.test.ts` — the allowance, through the real database.
- Locally, any process that speaks the same NDJSON on port 7860 can stand in
  for the agent, so the whole interface can be exercised without a key.
