# Deploying Armband

Three places, in this order:

1. **Supabase**: the database, pushed first
2. **Vercel**: the website, with the Gaffer running inside it (ADR-0014)
3. **Supabase Auth and Google**: the last settings need the website's address

About 30 minutes the first time. Architecture and reasons: ADR-0008
(accounts), ADR-0011 (account deletion), ADR-0014 (the Gaffer on Vercel).

Two rules hold throughout:

- **`ANTHROPIC_API_KEY` lives only in Vercel's environment variables**, marked
  Sensitive, never prefixed `NEXT_PUBLIC_`. Not in `.env`, not in git, not in
  chat.
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

The publishable key (`sb_publishable_…`) is in **Project Settings → API
Keys**. It is meant to be public.

---

## 1. The website and the Gaffer on Vercel (10 min)

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `web`. The framework (Next.js) is detected.
3. **Install Command → Override:**
   ```
   cd .. && pnpm install --frozen-lockfile --filter "@fpl/web..."
   ```
   This installs the website and the two workspace packages it uses
   (`@fpl/shared`, `@fpl/agent`), not the pipeline jobs.
4. **Environment Variables:**

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | public |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | public |
   | `ANTHROPIC_API_KEY` | the key | tick **Sensitive**. Server-only |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` | uses the repo's exact pnpm |

5. **Deploy.** Note the production URL, e.g. `https://armband.vercel.app`.
6. Add `NEXT_PUBLIC_SITE_URL` = that URL, then **Redeploy**. It is used for
   share images and links.

**Ask the key's owner to set a spend limit on it** (Anthropic Console →
Limits). That is the hard ceiling under all of our own limits.

---

## 2. Sign-in: Supabase Auth and Google (10 min)

### 2a. Supabase Auth settings

Go to Supabase → **Authentication**.

- **Sign In / Providers → User Signups**: **Allow new users to sign up** on,
  **Confirm email** off. Without our own email provider, Supabase's built-in
  mailer only reaches your own team, so confirmation emails would never
  arrive. Accounts start signed in straight away.
- **Sign In / Providers → Email → Minimum password length**: `8`, to match
  the site and the tests.
- **URL Configuration**:
  - **Site URL**: your production URL
  - **Redirect URLs**: `https://<your-domain>/**` (and `http://localhost:3000/**`
    for local work)

### 2b. Google sign-in

1. **console.cloud.google.com** → create (or pick) a project.
2. **Google Auth Platform** (formerly *OAuth consent screen*):
   - Audience **External**, app name **Armband**, plus your support email.
   - Scopes: the defaults (`email`, `profile`, `openid`). No verification is
     needed for these.
   - **Branding**: application home page `https://<your-domain>`, privacy
     policy `https://<your-domain>/privacy`, terms of service
     `https://<your-domain>/terms`, authorized domain `<your-domain>`.
     Google requires the home page and privacy policy before publishing.
     **Leave the logo empty**: uploading one sends the app to Google's manual
     verification.
   - **Audience → Publish app**, so anyone can sign in, not only test users.
     Until then, add your own email under **Test users** to try it.
3. **Clients → Create client**. One client serves local development and
   production:
   - Type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:3000` and your
     production URL
   - **Authorized redirect URIs** (Supabase's address, not the website's):
     `http://localhost:54321/auth/v1/callback` and
     `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** into Supabase →
   **Authentication → Sign In / Providers → Google**, then enable it and
   **Save**. Locally, the same pair goes in `supabase/.env` (gitignored).

The Google secret lives only in Supabase and `supabase/.env`. Never in Vercel
or git.

---

## 3. Smoke test, then warm up the demo (5 min)

On your phone, on the production URL:

1. **Get started** → create an account with email and password → you land on
   *Now, your team*.
2. Enter `7653564` → the *Is this you?* card shows the team and its 15 kits →
   **Yes** → your dugout.
3. Ask the Gaffer *Pick my best XI and captain for this gameweek* → the lookup
   appears, the pitch redraws with **Apply / Revert**, and the counter reads
   **4 of 5 questions left**.
4. Settings → *1 of 5 questions used*. Sign out, then log in with Google.
5. **Warm up the demo:** open `/demo` and click each of the four questions
   once.
   - Those four clicks are the demo's only agent runs **for this gameweek**.
   - Every visitor after you gets the recorded answers.
   - Do this before you share the link, so the first visitor doesn't wait.
6. Anthropic Console → **Usage** shows what those runs cost (about a tenth of
   a cent each).

---

## What the Gaffer can spend

| Guard | Value | Where |
| --- | --- | --- |
| Questions per account | **5, for life**, counted only when an answer completes; off-topic questions are free; kept per email fingerprint (ADR-0013) | `api.consume_question()` and `AGENT_LIMITS.questionsPerAccount` |
| Demo | 4 runs per gameweek, replayed to everyone | `web/src/app/api/demo/route.ts` |
| Per question | 6 model turns, $0.02, priced from the reported tokens | `AGENT_LIMITS.maxTurns`, `perQuestionBudgetUsd` |
| Per server instance, per UK day | $0.50 and 10 questions per caller. Best effort: each Vercel instance keeps its own count | `AGENT_LIMITS.dailyBudgetUsd`, `questionsPerCallerPerDay` |
| Hard ceiling | the key's own spend limit | Anthropic Console (key owner) |

Anonymous visitors never start a run.

**To change a limit:**

1. Edit `AGENT_LIMITS` in `packages/shared/src/agent-protocol.ts`.
2. For the account limit, also add a **new migration** changing
   `lifetime_limit` in `api.consume_question()`. A test checks the two match.
3. Push, and Vercel redeploys.

---

## Before the repo goes public

- Scan the whole history with `gitleaks` (clean on 2026-10-29; known false
  positives are in `.gitleaksignore`):
  ```bash
  docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:v8.24.3 git /repo --redact
  ```
- See CLAUDE.md §8 before charging anyone (kits, Vercel plan, Gemini terms).
