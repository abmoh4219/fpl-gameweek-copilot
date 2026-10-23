# Make.com scenarios

How the two Make scenarios are built, what each module costs, and how to
re-create them from scratch. Design rationale: ADR-0001 and ADR-0006.

Make **routes only**. Every message arrives already rendered and split, so no
scenario formats text or loops over players.

---

## Scenario 1 — FPL events

Receives the daily report (from `daily-sync`) and intraday news alerts (from
`price-sync`). Both use the same payload:

```json
{
  "version": 1,
  "kind": "daily_report | news_alert",
  "headline": "FPL price report — 2026-10-23",
  "messages": ["<b>…</b> Telegram HTML", "…"],
  "xDraft": "text for X, or null",
  "eventCount": 7,
  "secret": "MAKE_WEBHOOK_SECRET"
}
```

```
 Custom webhook ──[secret matches]──> Router
                                        ├── Iterator(messages) ──> Telegram: send to CHANNEL (HTML)
                                        └──[xDraft exists]──────> Telegram: send to YOUR chat
```

### Credits per run

| Module | Daily report | News alert |
| --- | --- | --- |
| Custom webhook | 1 | 1 |
| Iterator | 1 | 1 |
| Telegram → channel | 1 per message (usually 1-2) | 1 |
| Telegram → your chat (X draft) | 1 | 0 (no draft) |
| **Total** | **~4-5** | **~3** |

A request whose secret does not match stops at the first filter: 1 credit.

### Build it (about 15 minutes)

Before you start:

- **Make your bot an admin of the channel**, with permission to post
  messages. Without that, Telegram rejects every send.
- **Generate the shared secret** with `openssl rand -hex 32`, then put it in
  your local `.env` as `MAKE_WEBHOOK_SECRET`.

Steps:

1. **Create a scenario** called `FPL events`.
2. **Add the trigger.** Choose *Webhooks → Custom webhook*, then *Add*, and name
   it `fpl-events`. Copy the URL into `.env` as `MAKE_WEBHOOK_EVENTS_URL`.
   Make is now waiting for a sample request, so run this from the repo root:
   ```bash
   pnpm make:sample
   ```
   Make shows *Successfully determined*. Nothing is posted anywhere yet.
3. **Add a router.** Click *+* after the webhook and choose
   *Flow Control → Router*.
4. **Add the secret filter.** Click the link between the webhook and the
   router, then *Set up a filter*:
   - Label: `secret ok`
   - Condition: `secret`, then *Text operators: Equal to (case sensitive)*,
     then paste your secret.
5. **Build route 1, the channel.**
   1. Add *Flow Control → Iterator*. For *Array*, map `messages`.
   2. After it, add *Telegram Bot → Send a Text Message or a Reply*. Add a
      connection with your bot token.
      - Chat ID: your channel, for example `@your_channel`
      - Text: the iterator's `Value`
      - Parse mode: `HTML`
      - Disable link previews: `Yes`
6. **Build route 2, the X draft to you.**
   1. Add another *Telegram Bot → Send a Text Message or a Reply* on the
      router's second branch, using the same connection.
      - Chat ID: your own chat ID (the same as `TELEGRAM_ALERT_CHAT_ID`)
      - Text: `Draft for X:` followed by a new line and `xDraft`
      - Parse mode: leave empty, so the draft arrives as plain text that
        copies cleanly
   2. On the link into this module, add a filter:
      - Label: `has draft`
      - Condition: `xDraft`, then *Basic operators: Exists*
7. **Set the schedule.** Open the scenario's scheduling settings and choose
   *Immediately as data arrives*. Turn the scenario **ON** and save.
8. **Test it end to end** with `pnpm make:sample` again. You should get two
   messages in the channel and one draft in your own chat.
9. **Give GitHub the secrets:**
   ```bash
   gh secret set MAKE_WEBHOOK_EVENTS_URL   # paste the webhook URL
   gh secret set MAKE_WEBHOOK_SECRET       # paste the same secret
   ```
   Until these exist, both jobs log a warning and deliver nothing. Nothing
   else changes.
10. **Export the blueprint.** Choose *… → Export blueprint* and save it as
    `make/blueprints/events.raw.json`. The `*.raw.json` pattern is gitignored,
    because the export embeds the webhook and connection IDs. Then commit a
    sanitised copy as `make/blueprints/events.json`, with the webhook ID,
    connection IDs, chat IDs and the secret replaced by placeholders.

### Checking it

```sql
-- every delivery attempt, newest first
select kind, delivery_date, ok, http_status, message_count, event_count, error, sent_at
from core.deliveries order by sent_at desc limit 20;
```

`ok = true` means Make **accepted** the payload. If the channel is still
empty, open the scenario's *History* in Make: a Telegram error such as "chat
not found" or "not enough rights" shows up there, not in our database.

---

## Scenario 2 — gameweek preview

Built in Phase 6.
