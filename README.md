# PRITE Daily

A daily-practice platform for a psychiatry residency class: answer a regimented
number of PRITE-style questions each day, compete on a class leaderboard, keep
private and shared notes, and export study material — anchored to an exam date.

This repo currently contains the **clickable front-end prototype** (the question
screen) wired up as a runnable Vite + React + TypeScript app. There is **no
backend yet** — all data on screen is in-memory sample content.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build (esbuild, no type gate) -> dist/
npm run preview    # serve the production build locally
npm run typecheck  # opt-in strict tsc pass (prototype has known loose types)
```

## What the prototype demonstrates

The app now loads the **real extracted bank** (`public/data/questions.json`,
served via a symlink to `extraction/output/`, with images under `/images/`):

- **All 3,590 questions**, 2014–2025, with a **year filter**, prev/next, and a
  jump-to-number box. Each question shows its provenance (`2014 · Q83 · slide 85`).
- **Question screen** — vignette, answer options, Submit. Genuine figures (MRI,
  pedigree, EEG) render **with the question**; pasted explanation screenshots
  stay hidden until you answer.
- **Multi-select** — "select all that apply" questions allow multiple picks and
  grade on the full set.
- **Answer reveal** — correct/incorrect with the right answer; **confetti** on a
  correct answer (reduced-motion users get the calm version).
- **Tabs** after reveal: Explanation (written text + explanation images),
  My notes (local), Group notes (local preview).

Still front-end only: notes are in-memory (cleared on reload), and there's no
class answer distribution, flashcard, leaderboard, or export yet — those arrive
with the backend. The earlier hardcoded-sample prototype is preserved at
`src/App.prototype-sample.tsx.bak` for reference.

### Data flow

```
extraction/output/questions_all.json  ──symlink──▶  public/data/questions.json
extraction/output/images/<year>/...   ──symlink──▶  public/images/<year>/...
```

Re-running the extractor refreshes both automatically (the app re-fetches on
load). Hand-corrections live in `extraction/corrections.json`, not in generated
output, so they survive re-extraction.

## Full spec (from the design conversation)

- **Auth** — Google login; verified email is the trusted identity.
- **Access** — roster allowlist (auto-approve residents, optionally by Workspace
  domain) + a pending queue you approve from for faculty/alumni. Admin role for you.
- **Regimen** — exam-date-anchored, 5 / 10 / 20 questions per day, unsubscribe anytime.
- **Answers** — one row per `(user_id, question_id, answered_at, correct)`; the
  daily set, de-duplication, stats, and leaderboard all hang off this table.
- **Review recycling** — per-user toggle (retire answered vs. resurface missed)
  + interval; start with a fixed interval, leave room for Anki-style escalation.
- **Notes** — private per-user notes; attributed shared thread per question with
  admin delete. Not live-collaborative ("refresh and you see new notes").
- **Stats** — per-question % correct, attempts, answer-choice distribution.
- **Exports** — "my notes" and "group notes" → PDF/CSV with original Q&A
  (no AI explanation). Available anytime, not just at 90 days.
- **Flashcards** — generate-once-and-cache per question (hard ceiling ~3,000 AI
  calls ever); admin refines the one canonical card. `.apkg` via genanki.
- **Email** — daily reminder + freshly rendered leaderboard PNG + link, via
  Resend (free tier: 3,000/mo, 100/day — fine for a class under ~100 recipients).
- **Cost** — plausibly $0; ~$20/mo only if daily recipients exceed ~100. Optional
  domain ~$12/yr.

### The long pole

Getting ~3,000 questions out of PowerPoint into clean structured records
(stem, choices, correct answer, explanation text, explanation image) is the bulk
of the work. A `python-pptx` extraction script is the next major build, and how
clean the slide layouts are decides how much manual QA is needed.

### Copyright note

If the bank contains real recalled PRITE items, the American College of
Psychiatrists holds the copyright and the exam is secure — the export feature in
particular is a leakage path. Keep this deliberate and program-internal.

## Roadmap

1. **(done)** Clickable front-end prototype — this repo.
2. **(done)** PowerPoint extraction script (`python-pptx`) → structured question
   JSON + images. See [`extraction/`](extraction/). ~3,590 questions from the 12
   decks (2014–2025), 0 unresolved answers, 0 needing review, multi-select
   handled, figures vs. animated explanation reveals separated.
3. **(in progress)** Real questions wired into the prototype UI — the question
   screen now loads the full bank with navigation, year filter, figures, and the
   answer reveal. Still front-end only (no persistence). Next: data model +
   database (questions, users, answers, notes, flashcards, schedule).
4. Google auth + roster/approval queue + admin role.
5. Daily-set logic (regimen + review recycling) wired to the real UI.
6. Notes, stats, exports backed by the database.
7. On-demand flashcard generation + caching; `.apkg` export via genanki.
8. Scheduled daily email + leaderboard PNG rendering (Resend).
9. Deploy (free-tier host + DB + auth).

## Stack

Vite · React 18 · TypeScript · lucide-react. Pinned to Vite 5.x for Node 18.
