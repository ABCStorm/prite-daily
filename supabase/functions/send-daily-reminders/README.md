# Daily practice reminders — setup

**Status: live.** Deployed, scheduled, and sending.

`settings.daily_reminder` is tri-state:
- `null` (the default for every new signup) = **auto** — on during the 90 days
  before the user's exam date, off after. If they haven't set an exam date,
  a guessed **Oct 6** is used instead (`reminderWindow.ts`, mirrored client-side
  in `src/lib/reminderWindow.ts`).
- `true` / `false` = the user explicitly overrode it — via the Settings
  toggle, the in-app prompt, or the email's Unsubscribe link — and auto mode
  no longer applies to them.

`settings.reminder_every_days` (default 1) throttles frequency: a user is only
actually emailed on days where `daysSinceEpoch % reminder_every_days === 0`.
Editable in Settings, or via the email's **Change frequency** link.

Each email includes:
- the recipient's rank in the residency, by distinct questions done during the
  current discrete 2-week **contest period** — computed fresh from `answers`
  at send time, no separate leaderboard table needed. Contest periods
  (`contestPeriods.ts`) are non-overlapping 2-week blocks tiling *backward*
  from a fixed cutoff of **Oct 7** — pinned to that calendar date on its own,
  independent of the guessed/real exam date — not a rolling window, so each
  period has an actual winner. No periods run past Oct 7; the final stretch
  before the exam is left as individual cram time. Once the season's over,
  ranking falls back to a rolling trailing-14-day window;
- **the morning after each contest period ends**, every recipient also gets a
  fun trophy/confetti winner-announcement card (framed as "You won!" for the
  winner(s), or "<name> took the crown!" for everyone else; ties share the
  win and are listed by first name);
- a countdown-to-exam badge — days until the recipient's real `exam_date`, or
  the same guessed Oct 6 used for the auto window if they haven't set one
  (labeled "estimated" in that case); hidden once the date has passed;
- a rotating "dad joke of the day" (`jokes.ts`, 90-entry pool, one per calendar
  day before repeating);
- a one-click **Unsubscribe** button — no login required. It links to the
  sibling `unsubscribe-reminder` function, which verifies a signed token
  (`UNSUB_SECRET`) before flipping `settings.daily_reminder` to `false`;
- a **Change frequency** button linking to `${APP_URL}/?openSettings=1`, which
  auto-opens the Settings panel once the user is signed in (App.tsx).

## In-app opt-in prompt
Besides the Settings toggle, `src/lib/reminderPrompt.ts` + the modal in
`App.tsx` nudge each user to opt in at most 3 times — day 2 of use, day 14,
and day 28 — tracked in localStorage, and skipped entirely once reminders are
already effectively on (explicit true, or auto-on within the exam window).

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
