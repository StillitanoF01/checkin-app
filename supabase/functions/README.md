# Edge Functions

## `check-window`
Evaluates today's check-in window and sends any due notifications. Idempotent — safe to
run every few minutes.

### Secrets (server-side only)
Notifications are sent via the Telegram Bot API. Recipients are Telegram **chat IDs**
(never hardcoded): `TELEGRAM_GRANDMA_CHAT_ID` = Nonna, `TELEGRAM_MUM_CHAT_ID` = Iliana.
```bash
supabase secrets set \
  NOTIFY_PROVIDER=telegram \
  TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token \
  TELEGRAM_GRANDMA_CHAT_ID=111111111 \
  TELEGRAM_MUM_CHAT_ID=222222222 \
  CRON_SECRET=some-long-random-string \
  APP_URL=https://your-app.vercel.app
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically at runtime.
```
Leave `NOTIFY_PROVIDER=mock` (or unset) to record sends to `notifications_log` without
actually messaging — useful while wiring things up. To find a chat ID, message your bot
and read `chat.id` from `https://api.telegram.org/bot<TOKEN>/getUpdates`.

`APP_URL` is optional. When set, every Telegram message includes a one-tap inline button
("Check In Now" for Nonna's messages, "Open Dashboard" for Iliana's) linking straight to
`APP_URL/nonna` or `APP_URL/iliana`. Omit it to send plain-text messages with no button.

Adding more recipients later is a small change: add the env var, then map it in the
`recipients` object in `check-window/index.ts` and the `Recipients` type in
`_shared/scheduler.ts`.

### Deploy
```bash
supabase functions deploy check-window --no-verify-jwt
```
`--no-verify-jwt` disables Supabase's built-in JWT gate so the pg_cron job (which
authenticates with the `x-cron-secret` header, not a Supabase JWT) can reach the
function. Access is instead protected by `CRON_SECRET` inside the function.

### Schedule
Apply `supabase/migrations/0002_scheduler.sql` after storing the URL + secret in Vault
(see the comments in that file). It runs the function every 5 minutes via `pg_cron`.

### Manual test (no waiting for the clock)
The function accepts an explicit `now` in a POST body so you can simulate any moment:
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/check-window' \
  -H 'x-cron-secret: YOUR_CRON_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"now":"2025-01-15T10:05:00+11:00"}'
```
With `NOTIFY_PROVIDER=mock` this records the escalation to `notifications_log` and
returns a JSON summary — verify exactly one `missed_nonna` and one `missed_iliana` row.

## Shared code
`_shared/scheduler.ts` (the decision + side-effect orchestration), `_shared/windowLogic`
(imported from the canonical `src/lib/windowLogic.ts`, the one file shared with the
frontend so "today"/window math can never diverge), `_shared/notifications.ts` (the
swappable provider), and `_shared/messages.ts` (all message copy). The scheduler logic is
unit-tested end-to-end offline in `src/lib/scheduler.test.ts`.
