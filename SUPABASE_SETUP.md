# Supabase setup

This connects the app to a free Supabase backend with Google login. It's ~15
minutes of clicks. The only things I can't do for you are creating the accounts
and pasting secrets — everything else (schema, client, import) is already built.
When you finish steps 1–5, paste me the two values from step 4 and I'll wire the
app to it and verify.

---

## 1. Create the Supabase project (free)

1. Go to **https://supabase.com** → sign in (you can use your Google account).
2. **New project**. Name it e.g. `prite-daily`. Pick a region near Ohio
   (e.g. `East US`). Set a database password (save it somewhere; you rarely need it).
3. Wait ~2 minutes for it to provision.

## 2. Create the database schema

1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/migrations/0001_init.sql` from this repo, copy the whole file,
   paste it in, and click **Run**.
3. You should see "Success. No rows returned." (If any error appears, send it to
   me — I'll fix the SQL.)

## 3. Enable Google login

**3a. Create a Google OAuth client**
1. Go to **https://console.cloud.google.com** → create/select a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill app
   name + your email, save. Add yourself as a **Test user** (so you can log in
   before it's verified).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URI**: paste the callback URL from Supabase
     (next step gives it to you) — it looks like
     `https://<your-ref>.supabase.co/auth/v1/callback`.
   - Create → copy the **Client ID** and **Client secret**.

**3b. Turn it on in Supabase**
1. Supabase → **Authentication → Sign In / Providers → Google**.
2. Enable it, paste the **Client ID** and **Client secret**, and copy the
   **Callback URL** shown there back into the Google redirect URI from 3a.
3. **Authentication → URL Configuration**: set **Site URL** to
   `http://localhost:5173` for now (we'll add the deployed URL later).

## 4. Get your keys

1. Supabase → **Project Settings → API**.
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. In the repo, copy `.env.example` to `.env.local` and paste both values.
   (Or just send them to me and I'll create `.env.local`.)

## 5. Make yourself admin + load the roster

After you log in once (so your profile row exists), run this in the SQL Editor,
replacing the email:

```sql
-- make yourself an admin
update profiles set role = 'admin', status = 'approved'
where email = 'andrew.correll@wright.edu';

-- (optional) auto-approve everyone on your residency's Google Workspace domain
update app_config set workspace_domain = 'wright.edu';

-- (optional) pre-approve specific people up front
insert into roster (email, role) values
  ('resident1@example.com', 'resident'),
  ('faculty1@example.com',  'faculty')
on conflict (email) do nothing;
```

> **Note on migrations:** `0007` (email-allowlist auth) and `0008` (revert to
> Google) are part of the history. If you ran `0007` on your project, run
> `0008_revert_to_google_approval.sql` to restore Google name-match approval. A
> fresh project that only ran `0001`–`0006` already has the right behaviour and
> can skip both.

---

## What's already built for you

- `supabase/migrations/0001_init.sql` — full schema: profiles, roster +
  approval queue, settings (5/10/20 regimen, exam date, recycling), answers,
  individual + group notes, flashcards, Row-Level Security, the auto-approval
  trigger, and `question_stats()` / `leaderboard()` aggregate functions.
- `src/lib/supabase.ts` — the browser client (degrades to local-only mode when
  no keys are set, so the app keeps working meanwhile).
- The 3,590 questions stay static (`public/data/questions.json` + `/images`),
  referenced by the id `"<year>-<q_index>"`.

## What I do once you paste the keys (step 4)

- Wire Google sign-in + the pending/approved gate into the app.
- Persist answers, settings, and notes to the database.
- Light up the daily 5/10/20 regimen, missed-question recycling, per-question
  class stats, the real leaderboard, and exports.
