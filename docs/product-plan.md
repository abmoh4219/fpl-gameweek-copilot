# Product plan v2 — Gameweek Copilot

Validated with the owner on 2026-10-28. Supersedes the UI parts of
`docs/agent-plan.md`; the data layer, tools and agent service there stay.

**Bar:** a genuine product, not a demo. No implementation details in the UI
(no model names, no "N tools"). Deployment guide only when everything is done.

---

## Decisions

| Topic | Decision |
| --- | --- |
| Visual language | Wastena-style: near-black, mesh-gradient glow, one lime accent, pill buttons, the real product shown under the hero, isometric line art, two-column FAQ. FPL-style pitch inside the app |
| Kits & badges | **Official**, loaded from source — FPL kit images and football-data crests, never copied into the repo; our own shirt drawing as fallback. Must be replaced before charging money (ADR-0010) |
| Accounts | Supabase Auth: **Google** + **email & password**. Email confirmation off, so sign-up sends no email and needs no third-party service |
| After sign-up | Connect your FPL team → "Is this you?" preview → confirm → dashboard. Returning users go straight to the dashboard |
| Demo | No typing. Demo team 7653564 + **4 template questions**, each a real co-pilot run **recorded once per UK day** and replayed for everyone else |
| Limits | Per **account**: 10 questions/day (database). Service-wide daily $ cap. Key spend limit as the hard ceiling |
| football-data.org | PL table, top scorers, match kickoffs via the daily job — **1 → 4 requests/day** (after today's core) |
| Deadline | **Today: core only.** League / Fixtures / Players pages come right after |

---

## User flows

```
Visitor ─▶ Landing ─┬─▶ "Try the demo"  ─▶ /demo  (pitch + 4 recorded questions)
                    │                         └─▶ "Sign up to ask about your team"
                    └─▶ "Get started"    ─▶ /sign-up (Google or email+password)
                                               ─▶ /onboarding  team ID ─▶ "Is this you?" ─▶ confirm
                                               ─▶ /app  My team + Copilot (10 questions/day)
Returning user ─▶ /sign-in ─▶ /app            Settings: change team, sign out
```

---

## Phases for today

| # | Phase | Done when |
| --- | --- | --- |
| C1 | **Foundations** — design tokens v2, Supabase Auth (local config + migration: `app.profiles`, `app.agent_usage`, quota function), session handling (`proxy.ts`, server/browser clients) | Sign up, sign in, sign out work locally; RLS tests pass |
| C2 | **Landing v2** — nav, mesh hero, live product preview, data-source strip, 4 isometric feature cards, how it works, "numbers by code", FAQ, closing CTA, footer | Looks like a shipped product on desktop and phone |
| C3 | **Auth pages + onboarding + app shell** — sign-in/up (Google + email), connect-team with preview, sidebar app layout | New user reaches their dashboard in under a minute |
| C4 | **My team v2 + Copilot v2** — FPL-style pitch with official kits, plates, badges, bench; co-pilot panel with per-account limits; `/demo` with recorded answers | Signed-in user asks; demo replays; limits hold |
| C5 | **Polish + deploy guide** — empty/loading/error states, mobile, accessibility, metadata; then `docs/deploy.md` rewritten for auth | Owner signs off, then deploys |

## Right after today

League (PL table + top scorers, football-data), Fixtures (difficulty grid),
Players (search + cards), price watch page, Telegram bot.
