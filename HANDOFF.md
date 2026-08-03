# PRITE Daily — handoff notes

Quick orientation for picking this project up in a new session / account / machine.
Last updated: 2026-06-24.

## What this is
A daily PRITE (psychiatry in-training exam) practice web app for the Wright State
residency. React + TypeScript + Vite front end, Supabase back end. ~3,590 real
questions (2014–2025). Live at **https://pritedaily.com**.

## Question access control (READ before touching data loading / deploys)
The question **text** is access-gated; the **images** are still public (a known,
accepted tradeoff for now).
- The bank lives in a **private Supabase Storage bucket**: `bank/questions.json.gz`
  (gzipped). RLS policy `"approved read bank"` on `storage.objects` lets only
  signed-in **approved** members download it. `src/lib/db.ts` → `loadQuestionBank()`
  streams + inflates it; `App.tsx` only calls it once the user is signed in+approved.
- `public/data/questions.json` is a committed **2-byte `[]` stub** so the build can
  never copy the real bank into the public site. `public/_headers` sets
  `Cache-Control: no-store` on `/data/*`. Don't "fix" this by deleting the stub.
- The real data still lives in `extraction/output/questions_all.json` (in git) —
  re-upload to the bucket if it changes
  (`gzip -c extraction/output/questions_all.json > questions.json.gz`, upload to
  the `bank` bucket as `questions.json.gz`).
- Images (`/images/...`, ~205 MB) are still publicly fetchable.

## Auth + API keys — IMPORTANT (changed 2026-06-24)
- **Google sign-in** (Supabase OAuth). Working end-to-end on the custom domain.
- **The project migrated to Supabase's new API keys.** `.env.local`'s
  `VITE_SUPABASE_ANON_KEY` is now the **publishable key** (`sb_publishable_…`),
  NOT the old legacy JWT anon key. supabase-js ≥ 2.108 accepts it directly.
- **Legacy JWT-based API keys are DISABLED** (Settings → API Keys → "Disable
  JWT-based API keys"). The old `anon` and `service_role` JWTs now return 401.
  This was done after a `service_role` key was exposed; disabling the legacy keys
  is what neutralized it. The new ECC P-256 JWT signing key is the current signer.
- **Edge function** `generate-flashcard` uses Supabase's auto-injected
  `SUPABASE_SERVICE_ROLE_KEY`. Supabase swaps that injection to the new keys when
  legacy is disabled; verify Flashcard generation still works after any key change
  and, if it breaks, switch the function to a `SERVICE_KEY` env var holding an
  `sb_secret_…` key (edit + redeploy via the dashboard's Edge Function editor).
- History: auth was briefly email+password (migration 0007), abandoned because
  Wright State M365 filtering blocks confirmation emails; 0008 reverted to Google.

## How to run it
```bash
npm install        # first time
npm run dev        # dev server → http://localhost:5173 (launch.json pins 5183)
npm run build      # production build → dist/
npm run typecheck  # tsc
```
- Supabase keys live in `.env.local` (gitignored).
- `tsc` reports 3 **pre-existing** benign errors (`Flashcard.cached`, the `sql.js`
  wasm import, `import.meta.env`). Expected — don't chase them.
- **This Mac runs Node 18.** Two consequences: pin **wrangler@3** for deploys
  (wrangler@4 needs Node 22), and supabase-js's realtime client throws on Node 18
  (no WebSocket) — so the data loader scripts use raw `fetch` against PostgREST,
  not the supabase-js client (see `extraction/context_gen/load_to_supabase.mjs`).
  - **Update 2026-08-03: `node -v` is now v22.23.1** (`/opt/homebrew/bin/node`), so the
    local `node_modules/.bin/wrangler` (v4) works — used it for several thousand R2
    uploads. Deploys are still written against wrangler@3 above; nothing has been
    re-verified on v4, so don't switch the deploy command on this note alone.
    ⚠️ wrangler v4 `r2 object` writes to **simulated local storage** unless you pass
    `--remote`. Without it the command reports success and touches nothing real.

## Deployment (live on Cloudflare Pages)
Live at **https://pritedaily.com** and **https://prite-daily.pages.dev**
(Cloudflare Pages project `prite-daily`, direct upload of `dist/`).
```bash
npm run build
npx wrangler@3 pages deploy dist --project-name=prite-daily --branch main --commit-dirty=true
```
The dashboard direct-upload caps at 1,000 files (~1,273 here), so use the CLI.
`wrangler login` is a one-time interactive browser auth.

## Features (current)
Daily / Custom / Browse study modes; answer + reveal; class stats; leaderboard;
Residency Insights; personal Statistics; flashcards (AI cloze + Anki export);
group/individual notes; YouTube "Video" tab; PowerPoint/Anki export. Plus the
2026-06-24 additions below.

### Added 2026-06-24
- **Highlights** — select text in a question stem to highlight it; click a
  highlight to remove. Saved per user, cross-device. Table `highlights` (0012);
  `getMyHighlights`/`saveMyHighlights` in db.ts; `HighlightableText` in App.tsx.
- **Context tab ("Historical & memorable context")** — a memory-aid blurb per
  question. Shared cache table `question_context` (0013), 3,590 rows loaded by
  0014 / the loader. Read-only for members, admin-write. Lazy-loaded per question.
  AI-generated — carries the standard "can be wrong" disclaimer.
- **Clear learning opportunities** — "Clear all" in the Missed-questions panel
  now **flags** misses as `cleared` (answers.`cleared` column, 0015) instead of
  deleting — history/stats are kept; cleared rows drop off the chip, panel,
  "To review" stat, and recycle queue. `clearMissedAnswers` in db.ts.
- **Right-click to cross out** answer choices (process of elimination); per-
  question, resets on navigation (local state `crossed`).
- **Balloon animation** on the **login-day streak** card; the login streak card
  now stays ~5.4s (was 3.4s). `Balloons` component + `balloonRiseA/B` keyframes.
- **Live crowd poll teams + statistics** (poll is **ephemeral** — Supabase
  Realtime broadcast, no DB). Participants pick a team; host shows a "Live polling
  group statistics" panel (ranked standings, leader crowned) and an **Export to
  Excel** (CSV) button; participants can download too. `exportPollTeams` in
  exports.ts; types in `src/lib/poll.ts`. Closing the poll loses the data.
- **One account per roster name** (0016) — the name-match auto-approval path now
  auto-approves only the FIRST account per name; later same-name accounts go to
  the pending queue for admin approval. **Exception: Andrew Correll** (multiple
  same-name accounts allowed). Duplicate check uses the full first name so e.g.
  Alexandra vs Alyssa Fowler are treated as distinct. Email/domain paths unchanged.

## Context-generation pipeline (extraction/context_gen/)
How the 3,590 `question_context` blurbs were produced:
1. `split.mjs` → compact per-batch input files in `in/` (30 questions each).
2. A background **workflow** ran one agent per batch (Claude, this session — no
   API key cost) writing `out/batch_NNN.json`.
3. `assemble.mjs` → `extraction/output/question_context.json` + the
   `0014_question_context_data.sql` migration (1.6 MB).
4. Loaded into Supabase with `load_to_supabase.mjs` (REST upsert; needs a
   `SUPABASE_SERVICE_ROLE_KEY`/secret key in the shell — the SQL Editor rejects
   the 1.6 MB file). `split_sql.mjs` makes paste-sized SQL chunks as a fallback.
   `in/` and `out/` are scratch; the canonical artifact is question_context.json.

## Migrations (supabase/migrations/)
0001 init · 0002 name approval · 0003 review-per-day · 0004 tags · 0005 training
level · 0006 flashcards · 0007 email-auth (abandoned) · 0008 revert-to-Google ·
0009 faculty roster · 0010 faculty role on match · 0011 admin faculty ·
**0012 highlights · 0013 question_context · 0014 question_context data ·
0015 answers.cleared · 0016 one-account-per-name approval trigger.**
The authoritative `handle_new_user()` trigger is now **0016** (build future
changes on it, not 0008/0010/0011).
**Numbering:** run `ls supabase/migrations | tail` and take the next free
number BEFORE writing a new migration — parallel work sessions once produced
two different 0048s (since renumbered). Numbers are documentation-only
(migrations are applied by hand), so a collision is confusing, not fatal.

## Gotchas / non-obvious things
- **Git remote:** private repo at **https://github.com/ABCStorm/prite-daily**
  (branch `main`). Push: `git add -A && git commit && git push` (auth via `gh`).
- **Images + question JSON live in git past `.gitignore`** (force-added so a fresh
  clone is complete). `public/images` and `public/data/questions.json` are
  symlinks into `extraction/output/`. `npm run build` follows them into `dist/`.
- The domain is on **Cloudflare** (hosting + originally email; email now unused —
  Google auth).

## Key files
- `src/App.tsx` — the whole UI (one big component file).
- `src/lib/supabase.ts` — client + `signInWithGoogle` / `signOut`.
- `src/lib/db.ts` — typed Supabase data access.
- `src/lib/poll.ts` — ephemeral live-poll broadcast helpers + types.
- `src/lib/useAuth.ts` — session + profile/approval gate.
- `src/lib/exports.ts` — HTML/CSV/Anki/PPTX exports.
- `supabase/migrations/` — schema 0001 → 0016.
- `extraction/` — Python pipeline (questions + images) and `context_gen/` (context).
