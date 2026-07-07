# Daily practice reminders — setup

**Status: live.** Deployed, scheduled, and sending.

Emails every approved member who opts in (Settings → "Email me a daily reminder",
or the in-app prompt — see below). Each email includes:
- the recipient's rank in the residency, by distinct questions done over the
  trailing 14 days — computed fresh from `answers` at send time, no separate
  leaderboard table needed;
- a rotating "dad joke of the day" (`jokes.ts`, 90-entry pool, one per calendar
  day before repeating);
- a one-click **Unsubscribe** button — no login required. It links to the
  sibling `unsubscribe-reminder` function, which verifies a signed token
  (`UNSUB_SECRET`) before flipping `settings.daily_reminder` off for that user.

## In-app opt-in prompt
Besides the Settings toggle, `src/lib/reminderPrompt.ts` + the modal in
`App.tsx` nudge each user to opt in at most 3 times — day 2 of use, day 14,
and day 28 — tracked in localStorage, and skipped entirely once opted in or
once all 3 nudges have been shown.

## ⚠️ Deliverability caveat (read first)
Wright State's Microsoft 365 filtering blocks mail to **@wright.edu** even from a
verified domain (this is why the app uses Google sign-in — see migration 0008).
Most residents sign in with **personal Google accounts**, so reminders reach those
gmail/etc. inboxes fine. Anyone whose sign-in email is **@wright.edu may not get
them.** No way around that without Wright IT involvement.

## 1. Email provider (Resend)
- Create a Resend account, verify a sending domain (e.g. `pritedaily.com`).
- Set Edge Function secrets (Project Settings → Edge Functions → Secrets):
  - `RESEND_API_KEY` = your Resend key
  - `REMINDER_FROM` = `PRITE Daily <noreply@pritedaily.com>` (on the verified domain)
  - `CRON_SECRET` = any long random string (the scheduler must send it)
  - `UNSUB_SECRET` = any long random string (signs one-click unsubscribe links)
  - `APP_URL` = `https://pritedaily.com` (optional)

## 2. Deploy the functions (no JWT — gated by CRON_SECRET / signed tokens instead)
Needs the Supabase CLI, logged into the account that owns this project (`supabase
login`, then `supabase link --project-ref <PROJECT_REF>` from the repo root) —
or paste each function in the dashboard's Edge Functions editor instead.
```bash
supabase functions deploy send-daily-reminders --no-verify-jwt
supabase functions deploy unsubscribe-reminder --no-verify-jwt
```

## 3. Schedule it daily (pg_cron + pg_net)
In the SQL Editor, enable the extensions once, then schedule. Replace
`<PROJECT_REF>` and `<CRON_SECRET>`. 12:00 UTC ≈ 7–8am US Eastern.
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'prite-daily-reminders',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-daily-reminders',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
-- to remove later: select cron.unschedule('prite-daily-reminders');
```

## Test it
```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/send-daily-reminders' \
  -H 'x-cron-secret: <CRON_SECRET>'
# → {"recipients":N,"sent":N,"failures":[]}
```

## Notes
- v1 nudges **every** opted-in member daily (no per-user "already practiced today"
  skip — that needs per-user timezones to be meaningful). The email is gentle.
- Unsubscribe: the email's Unsubscribe button flips the setting off directly
  (no login) — toggling it in Settings works the same way.
