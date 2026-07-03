# Check-In App

A dead-simple daily wellbeing check-in. **Nonna** taps one big button each morning;
**Iliana** gets a dashboard and **Telegram alerts if Nonna hasn't checked in** by the end
of the morning window. See [BRIEF.md](BRIEF.md) for the full spec and [DESIGN.md](DESIGN.md)
for the visual system (used for Iliana's surfaces).

## Stack
- **Frontend:** Vite + React + TypeScript, mobile-web-first PWA.
- **Backend:** Supabase (Postgres + Edge Functions + `pg_cron`).
- **Notifications:** Telegram Bot API, called only from a Supabase Edge Function.

## Getting started
```bash
npm install
cp .env.example .env      # fill in your Supabase + Telegram values
npm run dev               # http://localhost:5173
```

### Database
Apply the schema in `supabase/migrations/0001_init.sql` to your Supabase project
(via the SQL editor or `supabase db push`). It seeds the two profiles (Nonna, Iliana)
with no PIN, so the first login for each is a PIN-setup flow.

## Scripts
| Script | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Type-check + production build |
| `npm test` | Vitest unit suite (window/timezone logic) |
| `npm run typecheck` | Type-check only |

## Timezone & notification logic
All window math runs in the configured IANA timezone (default `Australia/Sydney`),
never UTC-naive. The core is a pure, unit-tested module (`src/lib/windowLogic.ts`) that
the scheduled Edge Function wraps. SMS sends go through a swappable
`NotificationProvider` (`telegram` in prod, `mock` for local/dev/tests) so the channel
can change without touching the timing logic. Recipient chat IDs come from env
(`TELEGRAM_GRANDMA_CHAT_ID` = Nonna, `TELEGRAM_MUM_CHAT_ID` = Iliana), never hardcoded.
