# Deploying Armband

Four places, in this order:

1. **Supabase**: the database, pushed first
2. **Hugging Face**: the agent
3. **Vercel**: the website
4. **Supabase Auth and Google**: these need the website's address

About 45 minutes the first time. Architecture and reasons: ADR-0008
(accounts), ADR-0009 (agent), ADR-0011 (account deletion).

Two rules hold throughout:

- **`ANTHROPIC_API_KEY` goes in the Hugging Face Space secrets and nowhere
  else.** Not Vercel, not `.env`, not git, not chat.
- **Push migrations before code.** A commit never changes the cloud database.

---

## 0. Database and jobs (5 min)

Push any new migrations before the code that needs them.
`pnpm supabase migration list` shows what the cloud is missing.

```bash
pnpm supabase db push
git push
gh workflow run price-sync     # optional: refresh cards now instead of waiting
```

Then open **Supabase → Advisors → Security Advisor**. Expect exactly the two
accepted findings (CLAUDE.md §4a):

- **Security Definer View**, on the owner-privileged `api` views
- **RLS Enabled No Policy**, on the `core` tables

Anything else is a real problem. Stop and fix it before going further.

Check the cards were published. This should print about 669:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/player_cards?select=fpl_id" \
  -H "apikey: <publishable key>" -H "Accept-Profile: api" | grep -o fpl_id | wc -l
```

The publishable key (`sb_publishable_…`) is in **Project Settings → API
Keys**. It is meant to be public.

---

## 1. The shared secret (1 min)

```bash
openssl rand -hex 32
```

Keep this value. It goes into the Space **and** Vercel, and nowhere else.

---

## 2. The agent on Hugging Face Spaces (10 min)

1. Build the four files to upload:
   ```bash
   pnpm --filter @fpl/agent build:space
   ```
   They land in `agent/space/`: `server.mjs`, `package.json`, `Dockerfile`,
   `README.md`. Nothing else from the repo is uploaded.
2. huggingface.co → **New → Space**:
   - Name: `armband-agent`
   - SDK: **Docker → Blank**
   - Hardware: **CPU basic · free**
   - Visibility: **Public**. The website has to reach it; the shared secret
     protects it.
3. **Files → Add file → Upload files**. Drop in the four files and **Commit**.
4. **Settings → Variables and secrets → New secret**, four times:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the key from your friend |
   | `AGENT_SHARED_SECRET` | the value from step 1 |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |

5. Wait for **Running** (2–4 min). Then open
   `https://<username>-armband-agent.hf.space/health`. You should see
   `"service":"armband-agent"`, `"ok":true` and `"keyLoaded":true`.

**Ask the key's owner to set a spend limit on it** (Anthropic Console →
Limits). That is the hard ceiling under all of our own limits.

---

## 3. The website on Vercel (10 min)

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `web`. The framework (Next.js) is detected.
3. **Install Command → Override:**
   ```
   cd .. && pnpm install --frozen-lockfile --filter "@fpl/web..."
   ```
   This installs only the website and `@fpl/shared`, never the 294 MB agent
   package.
4. **Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `AGENT_URL` | `https://<username>-armband-agent.hf.space` |
   | `AGENT_SHARED_SECRET` | the value from step 1 |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the repo's exact pnpm) |

   **Never add `ANTHROPIC_API_KEY` here.**
5. **Deploy.** Note the production URL, e.g. `https://armband.vercel.app`.
6. Add `NEXT_PUBLIC_SITE_URL` = that URL, then **Redeploy**. It is used for
   share images and links.

---

## 4. Sign-in: Supabase Auth and Google (15 min)

### 4a. Supabase Auth settings

Go to Supabase → **Authentication**.

- **Sign In / Providers → Email**: enabled. Turn **Confirm email** **OFF**.
  Without our own email provider, Supabase's built-in mailer only reaches
  your own team, so confirmation emails would never arrive. Accounts start
  signed in straight away.
- **Sign In / Providers → Email → Minimum password length**: `8`, to match
  the site and the tests.
- **URL Configuration**:
  - **Site URL**: your production URL
  - **Redirect URLs**: add `https://<your-domain>/auth/callback` and
    `http://localhost:3000/auth/callback`

### 4b. Google sign-in

1. **console.cloud.google.com** → create (or pick) a project.
2. **APIs & Services → OAuth consent screen**:
   - User type **External**
   - App name **Armband**, plus your support email
   - Scopes: the defaults (`email`, `profile`, `openid`). No verification is
     needed for these.
   - **Publish app**, so anyone can sign in, not only test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - **Authorized JavaScript origins**: your production URL
   - **Authorized redirect URIs**:
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase's address, not the website's)
4. Copy the **Client ID** and **Client secret** into Supabase →
   **Authentication → Sign In / Providers → Google**, then enable it and
   **Save**.

The Google secret lives only in Supabase. It never goes in Vercel or git.

---

## 5. Smoke test, then warm up the demo (5 min)

On your phone, on the production URL:

1. **Get started** → create an account with email and password → you land on
   *Now, your team*.
2. Enter `7653564` → the *Is this you?* card shows the team and its 15 kits →
   **Yes** → your dugout.
3. Tap a player → their card opens. Ask *Who should I captain this week?* →
   the lookups appear, the answer streams in, players light up, and the
   counter reads **4 of 5 questions left**. Then ask *Pick my best XI* → the
   pitch redraws with **Apply / Revert**.
4. Settings → *2 of 5 questions used*. Sign out, then log in with Google.
5. **Warm up the demo:** open `/demo` and click each of the four questions
   once.
   - Those four clicks are the demo's only agent runs **for this gameweek**.
   - Every visitor after you gets the recorded answers.
   - Do this before you share the link, so the first visitor doesn't wait.
6. `…hf.space/health` → `today.spentUsd` shows what those runs cost.

**If it says the co-pilot is waking up:** a free Space sleeps after about 48
hours idle and takes about 30 seconds to start. Open `/health` once before you
share anything.

---

## What the agent can spend

| Guard | Value | Where |
| --- | --- | --- |
| Questions per account | **5, for life**, counted only when an answer completes; off-topic questions are free | `api.consume_question()` and `AGENT_LIMITS.questionsPerAccount` |
| Backstop per caller in the agent service | 10 per UK day | `AGENT_LIMITS.questionsPerCallerPerDay` |
| Demo | 4 runs per gameweek, replayed to everyone | `web/src/app/api/demo/route.ts` |
| Service spend per UK day | $0.50, across everyone | `AGENT_LIMITS.dailyBudgetUsd` |
| Spend per question | $0.02, at most 6 model turns | `AGENT_LIMITS.perQuestionBudgetUsd`, `maxTurns` |
| Hard ceiling | the key's own spend limit | Anthropic Console (key owner) |

Anonymous visitors never start a run.

**To change a limit:**

1. Edit `AGENT_LIMITS` in `packages/shared/src/agent-protocol.ts`.
2. For the account limit, also add a **new migration** changing
   `lifetime_limit` in `api.consume_question()`. A test checks the two match.
3. Rebuild and re-upload the Space's `server.mjs`.
4. Redeploy Vercel.

---

## Before the repo goes public

- Replace `samples/fpl/entry.json` and `entry-picks.json`. They contain a
  real manager's team.
- Scan the whole history with `gitleaks`.
- See CLAUDE.md §8 before charging anyone (kits, Vercel plan, Gemini terms).
