# PRITE Daily — handoff notes

Quick orientation for picking this project up in a new session / account / machine.
Last updated: 2026-06-22.

## What this is
A daily PRITE (psychiatry in-training exam) practice web app for the Wright State
residency. React + TypeScript + Vite front end, Supabase back end. ~3,590 real
questions (2014–2025) extracted into `public/data/questions.json` + images.

## How to run it
```bash
npm install        # first time
npm run dev        # dev server → http://localhost:5173
npm run build      # production build → dist/
npm run typecheck  # tsc
```
- Supabase keys live in `.env.local` (gitignored). Without them the app runs in a
  local-only/degraded mode.
- `tsc` currently reports 3 **pre-existing** errors unrelated to app logic
  (`Flashcard.cached`, the `sql.js` wasm import, and `import.meta.env`). These are
  expected/benign — don't chase them.

## Current state (works)
- ✅ **Auth: Google sign-in** (Supabase OAuth). Working locally end-to-end.
- ✅ Daily / **Custom** / Browse study modes, answer + reveal, class stats,
  leaderboard, **Residency Insights**, personal **Statistics** tab, flashcards
  (AI cloze + Anki export), group/individual notes, a **YouTube "Video"** tab,
  PowerPoint/Anki deck export.
- ✅ Admin = `andrew.correll@wright.edu` (seeded). Roster name-match auto-approves
  known residents; others land in a pending queue admins approve.
- ✅ Production build is ready in `dist/` (complete: JS bundle + `questions.json`
  + all 1,213 images + a `_redirects` SPA fallback).

## Auth history — IMPORTANT
Auth was briefly switched to **email + password with a wright.edu allowlist**
(confirm-email flow) to avoid OAuth, then **reverted back to Google**. Reason:
Wright State's Microsoft 365 filtering blocks the confirmation/reset emails even
from a verified domain via Resend — undeliverable, so that path was abandoned.
- `supabase/migrations/0007_email_auth_allowlist.sql` = the abandoned email path.
- `supabase/migrations/0008_revert_to_google_approval.sql` = restores Google
  name-match approval and undoes 0007's "reject if not on roster" rule.
- **If `0007` was ever run on the live Supabase project, make sure `0008` was run
  too**, or Google logins from non-roster emails get rejected.
- Google OAuth needs no Wright IT involvement (personal Google accounts). The
  Google Cloud OAuth client + Client ID/Secret are already configured in Supabase.

## ✅ Deployment (DONE — live on Cloudflare Pages)
Live at **https://pritedaily.com** (custom domain) and
**https://prite-daily.pages.dev** (Cloudflare Pages project `prite-daily`,
direct upload of `dist/`). Google login works on the custom domain.

- **Redeploy after a code change:** `npm run build`, then
  ```bash
  npx wrangler@3 pages deploy dist --project-name=prite-daily --branch main
  ```
  Pin **wrangler@3** — this Mac runs Node 18 and wrangler@4 needs Node 22.
  `wrangler login` is a one-time interactive browser auth.
- The Cloudflare **dashboard** direct-upload caps at 1,000 files (this build has
  ~1,273), which is why we use the CLI.

### Remaining deploy follow-ups
- [x] Supabase redirect URLs + custom domain (`pritedaily.com`) — done; login works.
- [x] **Google OAuth consent screen published (In production)** — any resident
  with a Google account can now sign in; roster name-match auto-approves them.
  (Project: the "Gemini API" GCP project; OAuth client `prite-daily-web`.)
- [ ] (Optional) Get the project into a private GitHub repo for backup/portability
  — it currently only exists on this one Mac.

## Gotchas / non-obvious things
- **NOT a git repo yet.** The project exists only on this Mac. Get it into
  (private!) GitHub before moving machines — it contains copyrighted PRITE content,
  so the repo must be **private**.
- **Images are gitignored.** `extraction/output/` (~205 MB, 1,213 images) is
  excluded from git on purpose, and `public/images` is a **symlink** →
  `extraction/output/images`. `npm run build` follows the symlink and bakes the
  images into `dist/`. So a fresh git clone alone won't have images unless that
  folder travels with it. This is why we deploy the prebuilt `dist/` directly.
- A domain was purchased on **Cloudflare** for this project (intended for hosting
  + email). Email is no longer needed (Google auth), but the domain is still the
  right home for the deployed site.
- An open question was paused: **which account should own hosting** (Cloudflare).
  Nothing is deployed, so switching is still free.

## Key files
- `src/App.tsx` — the whole UI (single big component file).
- `src/lib/supabase.ts` — client + `signInWithGoogle` / `signOut`.
- `src/lib/db.ts` — typed Supabase data access.
- `src/lib/useAuth.ts` — session + profile/approval gate.
- `supabase/migrations/` — schema (0001) through revert-to-Google (0008).
- `SUPABASE_SETUP.md` — backend setup walkthrough (Google login version).
- `extraction/` — the Python pipeline that built `questions.json` + images.

## Suggested next steps
1. (Optional) Decide which account owns Cloudflare hosting.
2. Deploy `dist/` via Wrangler; add the URL to Supabase Redirect URLs.
3. Publish the Google consent screen to Production.
4. Attach the custom domain in Cloudflare Pages; add it to Supabase Redirect URLs.
5. Get the project into a private GitHub repo for backup/portability.
