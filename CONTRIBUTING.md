# Contributing to Armband

Thanks for wanting to help. Armband is free and open source, and contributions
of every size are welcome: a typo, a bug report, a new stat table, a better
fixture model.

## Before you start

- **Read [CLAUDE.md](CLAUDE.md).** Despite the name, it is the project's
  rulebook for humans too: how data flows, what the free tiers allow, and the
  rules every change keeps.
- **Open an issue first for anything bigger than a small fix**, so we can agree
  on the approach before you spend time on it.
- **Two rules matter most:**
  - **Code computes every number.** Metrics live in `packages/shared` as pure
    functions with unit tests; nothing shown to users is invented or estimated
    by a model.
  - **Forward-looking output is labelled an estimate**, every time.

## Running it locally

Requires Node 22+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env          # every variable is explained; most are optional locally
pnpm db:start                 # local Supabase
pnpm load:samples             # recorded API responses, loaded by the real loaders
pnpm --filter @fpl/web dev    # http://localhost:3000
```

`pnpm job:daily` syncs live FPL data into the local database. Run local jobs
with the delivery variables empty (`MAKE_WEBHOOK_EVENTS_URL=`,
`TELEGRAM_BOT_TOKEN=` and friends) so nothing is posted anywhere.

## Making a change

1. Fork, then branch from `main`.
2. Keep the change focused: one fix or feature per pull request.
3. Before you push:
   ```bash
   pnpm typecheck
   pnpm test
   pnpm --filter @fpl/web build
   ```
4. Use [conventional commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
5. In the pull request, say what changed and why, and add a screenshot for
   anything visual (desktop and phone width).

**Database changes** go in a new migration
(`pnpm supabase migration new <name>`). Never edit a migration that has
already been pushed.

## Good first issues

Look for issues labelled
[`good first issue`](https://github.com/abmoh4219/fpl-gameweek-copilot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
Ideas that are always welcome:

- a new leaderboard on the stats page, from data we already store
- accessibility fixes: keyboard navigation, screen-reader labels, contrast
- tests for an insight function that has thin coverage
- clearer wording anywhere on the site

## Security

Found a vulnerability, or a secret that should not be public? **Don't open a
public issue.** Email the maintainer (see the GitHub profile) and it will be
handled privately.

## Code of conduct

Be kind and constructive. Disagree with ideas, never with people.
