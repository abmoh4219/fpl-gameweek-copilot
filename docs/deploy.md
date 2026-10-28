# Deploying the website and the agent

Two deploys, in this order: the database and jobs first, then the agent on
Hugging Face, then the website on Vercel. About 30 minutes the first time.
Architecture and reasons: `docs/agent-plan.md`, ADR-0008, ADR-0009.

---

## 0. Database and jobs (5 min)

The site reads `api.player_cards` and `api.team_runs`, which the jobs publish.
Push the migrations **before** the code, then make the jobs publish once.

```bash
pnpm supabase db push          # adds site_views_team_code (kit colours)
git add . && git commit -m "feat: my-team view and Claude Agent SDK copilot"
git push
gh workflow run price-sync     # publishes player cards and team runs now
```

Check it worked — this should print about 669:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/player_cards?select=fpl_id" \
  -H "apikey: <publishable key>" -H "Accept-Profile: api" | grep -o fpl_id | wc -l
```

Your publishable key is in Supabase → **Project Settings → API Keys**
(starts with `sb_publishable_`). It is meant to be public.

---

## 1. Shared secret (1 min)

```bash
openssl rand -hex 32
```

Keep the value for the next two steps. It goes into the Space **and** Vercel.

---

## 2. The agent on Hugging Face Spaces (10 min)

1. Build the four files:
   ```bash
   pnpm --filter @fpl/agent build:space
   ```
   They are in `agent/space/`: `server.mjs`, `package.json`, `Dockerfile`,
   `README.md`. Nothing else from this repo is uploaded.
2. On huggingface.co: **New → Space**.
   - Name: `gameweek-copilot-agent`
   - SDK: **Docker** → **Blank**
   - Hardware: **CPU basic · free**
   - Visibility: **Public** (the website must reach it; the shared secret
     protects it)
3. In the new Space: **Files → Add file → Upload files**, drag in the four
   files from `agent/space/`, **Commit**.
4. **Settings → Variables and secrets → New secret**, four times:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the key from your friend |
   | `AGENT_SHARED_SECRET` | the value from step 1 |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |

5. The Space builds (2–4 min). When it shows **Running**, open
   `https://<your-name>-gameweek-copilot-agent.hf.space/health`. You should
   see `"ok":true` and `"keyLoaded":true`.

The Space URL is `https://<username>-<space-name>.hf.space` (shown under
**⋯ → Embed this Space → Direct URL**).

---

## 3. The website on Vercel (10 min)

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** `web`. Framework: Next.js (detected).
3. **Build and Output Settings → Install Command → Override:**
   ```
   cd .. && pnpm install --frozen-lockfile --filter "@fpl/web..."
   ```
   (installs only the website and `@fpl/shared` — never the 294 MB agent
   package).
4. **Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |
   | `AGENT_URL` | `https://<your-name>-gameweek-copilot-agent.hf.space` |
   | `AGENT_SHARED_SECRET` | the value from step 1 |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the repo's exact pnpm version) |

   **Never** add `ANTHROPIC_API_KEY` here.
5. **Deploy.** Then set `NEXT_PUBLIC_SITE_URL` to the production URL and
   redeploy once (it is used for share previews).

---

## 4. Smoke test (3 min)

1. Open the site on your phone → **or try a demo team** → the pitch shows
   team 7653564.
2. Tap a player → the card opens.
3. Ask "Who should I captain this week?" → the trace shows tool calls, the
   answer streams in, players glow on the pitch.
4. `…hf.space/health` → `today.spentUsd` went up by a fraction of a cent.

If the agent says it is waking up: a free Space sleeps after ~48 h idle and
takes ~30 s to start. Open `/health` once before sharing the link.

---

## Limits that are live

| Limit | Value | Where |
| --- | --- | --- |
| Questions per visitor per UK day | 5 | `AGENT_LIMITS` in `packages/shared/src/agent-protocol.ts` |
| Service spend per UK day | $0.50 | same |
| Spend per question | $0.03 | same (`maxBudgetUsd`) |
| Agent turns per question | 8 | same |
| Hard ceiling | the key's spend limit | Anthropic Console (key owner) |

Changing a limit: edit `AGENT_LIMITS`, rebuild the Space (step 2.1) and
re-upload `server.mjs`; for the per-visitor limit shown in the UI, redeploy
Vercel too.
