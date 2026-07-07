# Daily practice reminders — setup

Emails every approved member who opts in (Settings → "Email me a daily reminder").
Each email includes the recipient's rank in the residency — by distinct
questions done over the trailing 14 days — computed fresh from `answers` at
send time, no separate leaderboard table needed. The app side (opt-in toggle,
`settings.daily_reminder` column via migration 0018) is already live. To
actually send mail, do the three steps below.

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
  - `APP_URL` = `https://pritedaily.com` (optional)

## 2. Deploy the function (no JWT — it's gated by CRON_SECRET)
Needs the Supabase CLI, logged into the account that owns this project (`supabase
login`, then `supabase link --project-ref <PROJECT_REF>` from the repo root) —
or paste the function in the dashboard's Edge Functions editor instead.
```bash
supabase functions deploy send-daily-reminders --no-verify-jwt
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
- Unsubscribe = toggle the setting off; the next run skips them.
