# Podcast recommendations for the Video tab

Matches bank questions to real podcast episodes on YouTube and writes
`public/data/podcasts.json`, which the app lazy-loads when someone opens a
question's **Video** tab (`src/lib/podcasts.ts` → `PodcastPicks` in `App.tsx`).

Questions with no confident match render nothing and keep the existing
"Search YouTube" fallback. That is the common case by design — most of the bank
has no episode worth sending a resident to, and a near-miss recommendation costs
more of their time than no recommendation.

## Pipeline

```bash
node scripts/podcasts/build-index.mjs      # 1. index episodes  (~216 quota units)
node scripts/podcasts/match.mjs            # 2. embed + gate    (~$0.05 OpenAI embeddings)
node scripts/podcasts/verify.mjs           # 3. judge + emit    (Grok subscription via `grok -p`)
node scripts/podcasts/related.mjs          # 4. related-topic tier B for remaining gaps
node scripts/podcasts/verify.mjs --openai  # 3 alt: gpt-4o-mini text (emergency)
node scripts/podcasts/verify.mjs --claude  # 3 alt: Claude Code Haiku (when quota allows)
```

**1. `build-index.mjs`** enumerates each curated channel's *uploads playlist*
(`channels.mjs`). This is the whole reason the feature is affordable: a
`playlistItems` page of 50 videos costs 1 quota unit, while `search.list` costs
100 per call — matching 5,096 questions by search would need ~500,000 units
against a 10,000/day free quota. Filters out anything under 8 minutes (Shorts,
trailers), dedupes double-posted episodes, and parses chapter timestamps out of
descriptions. ~4,200+ episodes from ~25 channels (core psych + adjacent);
~9–13% publish chapters. Carlat and other psychopharm cores stay in the roster
on purpose — expansion only adds psychiatry-related teaching that still
survives the entity gate + LLM verify.

**2. `match.mjs`** embeds questions (`video_query` + answer + topics) and
episodes (title + chapters + description) with `text-embedding-3-small`, takes
the top 6 by cosine, then applies the **entity gate**: a candidate survives only
if one of the question's own `tags.medication` / `tags.diagnosis` terms appears
in the episode's *title or chapter list*. Description-only hits are deliberately
rejected — a drug named in show notes was usually mentioned in passing, and
gating on those is what paired "venlafaxine dosing" with a mood-stabilizer
episode. Gets ~33% of the bank to at least one plausible candidate.

**3. `verify.mjs`** asks Claude, per question, whether any candidate actually
*teaches* the tested concept, and rejects adjacent-but-wrong pairings (NMS vs.
acute dystonia). It also picks the matching chapter and writes the one-line
"why listen". Rationales containing hedges ("likely covers…", "may discuss…")
are dropped regardless of stated confidence — hedging means the model inferred
coverage from the title rather than recognizing it.

Judging defaults to the headless Grok CLI (`grok -p` / grok-4.5), billed to the
**Grok subscription** (OAuth in `~/.grok/auth.json`). Tools are disabled so each
batch is pure text. Fallbacks: `--openai` (gpt-4o-mini via `OPENAI_API_KEY`) or
`--claude` (Claude Code Haiku subscription; `ANTHROPIC_API_KEY` is stripped so
it cannot silently fall back to API billing).

> Grok headless uses cached login credentials and works non-interactively.
> The Claude path needs an interactive foreground shell (detached launches
> cannot reach the CLI's stored credentials). `--openai` has no such restriction.

**Audio TTS** is separate — Fish Audio via `scripts/audio/render-fish-audio.mjs`
(not this pipeline). Keep OpenAI/Fish for audio; use Grok for AI text.

Verdicts are cached in `.cache/verdicts.json`, so re-runs are free and an
interrupted run resumes. `--emit` rebuilds the sidecar from cache without
re-judging.

## Refreshing

```bash
node scripts/podcasts/build-index.mjs --incremental && node scripts/podcasts/match.mjs && node scripts/podcasts/verify.mjs
```

Monthly is plenty. The incremental index pull stops at the newest already-known
video, so a refresh costs a handful of quota units and only judges new pairings.

## Channel yield

`node scripts/podcasts/verify.mjs --emit --by-channel` prints kept/offered per
channel — how often a channel's gated candidates survive the judge. Use it to
prune the roster with data instead of taste.

The 2026-08-05 numbers settled one argument worth recording: general medical
teaching channels (Ninja Nerd 44%, Armando Hasudungan 49%, Neuroscientifically
Challenged 40%, Strong Medicine 35%) have the *highest* acceptance rates in the
roster — roughly double the psychiatry podcasts (13–22%). They are offered
rarely because the entity gate is strict, but when offered they are right. The
worry that they carry "too little psych signal" was not borne out; they are the
only source for the neuroanatomy and clinical-neurology items PRITE tests
heavily.

Persistent zero-yield channels as of that run: Institute of Human Anatomy (0/2),
PsychotherapyNet (0/2), Dr. Jeff Kieliszewski (0/1). They cost nothing
user-visible (they contribute no refs) but can be dropped to shrink the index.

## Caps

- max 2 episodes per question
- max 40 questions per episode (`MAX_PER_EPISODE`) so one strong ADHD episode
  doesn't get pinned to hundreds of questions and make the feature feel canned

## Keys

- `YOUTUBE_API_KEY` — env, `.env.local`, or the AcademicChallengeWiki `.env`
- `OPENAI_API_KEY` — `.env.local` (embeddings; optional `--openai` verify fallback)
- Grok login — `grok login` once (default verify backend uses subscription)
