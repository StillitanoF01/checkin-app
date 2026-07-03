# Check-In App — Project Brief

> For Claude Code: read this in Plan Mode, then propose staged build phases with
> acceptance criteria. A recommended phasing is included at the end (Section 12) —
> treat it as a strong default, refine as you see fit. Ask me before assuming any
> requirement not written here.

## 1. Purpose

A simple daily wellbeing check-in app. My grandmother ("Nonna", elderly) currently
texts my mum ("Iliana") every morning to confirm she is okay. This app replaces that
routine: Nonna taps one button each morning, and Iliana gets a dashboard plus SMS
alerts if Nonna hasn't checked in.

Design priority: **Nonna's experience must be dead simple** — large text, one obvious
button, no clutter, no confusing navigation. Iliana's side can be richer.

## 2. Users & roles

There are exactly two profiles. No public sign-up.

- **Nonna** — the elderly check-in user. Sees a single large check-in button.
- **Iliana** — the caregiver. Sees a dashboard and manages settings.

## 3. Tech stack (decided)

- **Frontend:** Vite + React (JavaScript or TypeScript — recommend TypeScript).
  Build as a **PWA / mobile-web-first** responsive app; primary device is a phone.
- **Backend / data:** **Supabase** (Postgres, Auth optional, Edge Functions, and
  `pg_cron` / Scheduled Edge Functions for the timed jobs).
- **SMS:** **Twilio** (Programmable SMS). All texts sent from a Supabase Edge Function
  calling the Twilio API — never expose the Twilio auth token to the frontend.
- **Hosting:** Frontend on Vercel or Netlify (free tier fine). Backend logic runs in
  Supabase.

## 4. Authentication (decided: simple PIN per profile)

- Landing page shows two buttons: **"NONNA LOGIN"** and **"ILIANA LOGIN"**.
- Tapping a profile prompts for a short **numeric PIN** (e.g. 4 digits).
- **First run / no PIN set yet:** if the chosen profile has no PIN, prompt to create
  one (set-up flow). This is the "set up a user profile for her" step from the spec.
- On success, the session is remembered on that device (e.g. persisted session /
  long-lived token) so Nonna doesn't have to log in every day. Provide a small
  "switch user / log out" affordance, kept out of Nonna's main way.
- Keep it lightweight. Do **not** build full email/password/reset. PINs can be stored
  hashed in Supabase; the two profiles are seeded rows.

## 5. Screens & behaviour

### 5.1 Landing / login
- Clean landing page, two large buttons: NONNA LOGIN, ILIANA LOGIN.
- PIN entry as described in Section 4.

### 5.2 Nonna (logged in)
- **One thing on screen: a large "I'M OK — CHECK IN" button.**
- Tapping it records a check-in for today (timestamp) and shows a clear, friendly
  confirmation (e.g. big green tick + "Thanks Nonna, see you tomorrow ❤️").
- If she already checked in today, show the confirmed state instead of the button
  (so she can't get confused about whether it worked).
- Large fonts, high contrast, generous tap targets. No menus, no scrolling needed.

### 5.3 Iliana (logged in) — dashboard
At minimum show:
- **Today's status:** Checked in ✅ / Not yet ⏳ / Missed ❌ (window closed, no check-in).
- **Check-in time** for today (if checked in).
- **History:** recent days (e.g. last 7–30) with date + time or "missed".
- Optional useful extras (your call, keep simple): current streak of consecutive days,
  last check-in timestamp, and the current notification settings.
- **Settings** Iliana can edit: the check-in window (default 06:00–10:00), the phone
  numbers for Nonna and Iliana, and the timezone.

## 6. Notification & timing logic (the core of the app)

All times are in a **single configured timezone** (default **Australia/Sydney** — the
family's local time). Store the timezone in settings; do all window math in that zone,
not UTC-naive. The daily "has she checked in" state resets each calendar day.

Define a daily window, default **06:00–10:00** local:

1. **06:00 — morning reminder to Nonna (SMS + in-app):**
   At window open, if Nonna hasn't already checked in, send her a gentle reminder to
   check in. (If push/in-app is available, fire that too; SMS is the reliable channel.)

2. **06:00–10:00 — check-in window:**
   Nonna can tap check-in anytime. A successful check-in cancels any pending
   "missed" alerts for the day.

3. **10:00 — window closes with no check-in → escalate:**
   As soon as 10:00 passes and there is still no check-in for today:
   - **SMS to Nonna:** "You haven't checked in yet — please check in now."
   - **SMS to Iliana:** "Nonna hasn't checked in yet today."
   - Mark today's status as **Missed** on Iliana's dashboard.

4. **Outside the window (after 10:00):**
   Iliana must be alerted that Nonna hasn't checked in — this is the whole point.
   The 10:00 escalation above covers it. If Nonna later checks in the same day
   (after 10:00), record it, update the dashboard to "Checked in (late, HH:MM)", and
   optionally send Iliana a follow-up "Nonna has now checked in" so she can relax.

**Implementation notes for the timed jobs:**
- Use Supabase **scheduled functions** (`pg_cron` or scheduled Edge Functions) running
  every few minutes, OR two precise daily crons at window-open and window-close. A
  frequent poll is more robust to server time drift — recommend a job every ~5 min that
  evaluates each profile's window state and sends any not-yet-sent notifications.
- **Idempotency:** never send the same notification twice. Track per-day flags
  (e.g. `reminder_sent`, `missed_alert_sent`, `checked_in_at`) so re-runs are safe.
- Handle the day rollover cleanly (a new day = fresh pending check-in).

## 7. Suggested data model (Supabase / Postgres)

Adjust as needed, but capture at least:

- **profiles**: `id`, `role` ('nonna' | 'iliana'), `display_name`, `pin_hash`,
  `phone_e164`, `created_at`.
- **settings** (single row or per-family): `timezone` (default 'Australia/Sydney'),
  `window_start` (default '06:00'), `window_end` (default '10:00'),
  `nonna_phone`, `iliana_phone`.
- **checkins**: `id`, `profile_id` (Nonna), `checkin_date` (local date),
  `checked_in_at` (timestamptz), unique on (`profile_id`, `checkin_date`).
- **daily_status** (or derive on the fly): per date — `reminder_sent_at`,
  `missed_alert_sent_at`, `late_checkin_notified_at`, computed `status`.
- **notifications_log** (optional but recommended): every SMS sent, with type,
  recipient, timestamp, Twilio message SID, and status — useful for debugging and
  proving an alert actually went out.

## 8. Secrets & config

Never commit secrets. Use environment variables / Supabase secrets:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (frontend), `SUPABASE_SERVICE_ROLE_KEY` (server only).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- Provide a `.env.example` documenting every variable. Twilio calls happen only in
  server-side (Edge Function) code.

## 9. Non-functional requirements

- **Accessibility first for Nonna:** minimum ~20px+ base font, high contrast, big
  buttons (≥48px), no reliance on fine motor precision or reading small text.
- **Reliability of alerts** matters more than feature richness — the missed-check-in
  SMS to Iliana is the safety-critical path. Log and, ideally, retry failed sends.
- **Phone numbers in E.164 format** (e.g. +61…) for Twilio.
- Timezone-correct throughout; do not hardcode UTC assumptions in window math.

## 10. Out of scope (for v1)

- Multiple families / multi-tenant accounts.
- Public registration, password reset flows, social login.
- Native iOS/Android apps (web/PWA only).
- Voice calls, WhatsApp, or medical/emergency-services integration.

## 11. Open questions for Claude Code to confirm with me

- Confirm timezone default (assuming Australia/Sydney).
- TypeScript vs JavaScript preference (recommend TS).
- Should the 06:00 reminder to Nonna also be SMS, or in-app/push only? (Brief assumes
  SMS reminder + in-app.)
- Do we want the "Nonna checked in late" reassurance SMS to Iliana? (Nice-to-have.)

## 12. Recommended staged build phases

Propose your own phase breakdown, but this ordering de-risks the project — get the
skeleton and shared data working before the timing/SMS complexity:

**Phase 0 — Scaffold & infra**
Vite + React (TS) project, routing, Supabase project connected, env config with
`.env.example`, deploy a hello-world to hosting. *Done when:* app runs locally and
deployed, Supabase reachable.

**Phase 1 — Auth & profiles (PIN)**
Landing page with two login buttons, PIN set-up on first run, PIN login, remembered
session, log out / switch user. *Done when:* can log in as Nonna or Iliana with a PIN;
first-run creates the PIN.

**Phase 2 — Nonna check-in**
Single large check-in button, writes a check-in row for today, confirmation state,
"already checked in today" state. *Done when:* tapping check-in persists to Supabase
and reflects immediately.

**Phase 3 — Iliana dashboard**
Today's status (checked in / not yet / missed), check-in time, history list, and
editable settings (window, phone numbers, timezone). *Done when:* dashboard reflects
Nonna's real check-ins and settings save.

**Phase 4 — Scheduled logic & SMS (Twilio)**
Supabase Edge Function + Twilio integration; scheduled job evaluating the window:
06:00 reminder to Nonna, 10:00 escalation SMS to Nonna and Iliana, idempotent per-day
flags, notifications log. *Done when:* a simulated missed morning triggers exactly one
SMS to each party; a check-in suppresses them.

**Phase 5 — Polish & hardening**
Accessibility pass for Nonna, timezone edge cases / day rollover, failed-SMS retry,
late check-in reassurance SMS (if wanted), empty/error states, basic tests for the
window logic. *Done when:* window logic is unit-tested and the Nonna flow is clean on
a phone.
