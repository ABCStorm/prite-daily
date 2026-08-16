# Wise owl statistics

A perched owl appears only when there is a **verified quantitative fact** that
is specifically relevant to the current question and links the public source.

Numbers are never invented. Canonical figures live in `canonical.py`; MEDLINE
figures retain their PubMed source. `eligibility.py` is the shared final gate:
it rejects numberless claims, exam-meta trivia, and assignments without strong
question-specific overlap. No Stat Cat is better than an irrelevant statistic.

## Audit and validate the current bundle

```sh
npm run owl:stats
npm run owl:test
```

The audit rewrites `public/data/owl_stats.json` and its matching gzip using the
PRITE and Therapy banks available in the checkout. Assignments from an absent
private bank are preserved. To regenerate canonical PRITE assignments first,
run `npm run owl:build:prite`; it also writes
`extraction/output/owl_stats.report.json`.

To audit the combined PRITE, Therapy, and private Kaufman Neuro banks, supply
the Neuro bank explicitly and require every assignment to resolve:

```sh
python3 scripts/owl-stats/prune-owl-stats.py \
  --neuro /secure/path/kaufman-questions.json --require-known
```

The pruning command writes byte-matched `.json` and `.json.gz` assets.

## Render Fish audio (elderly statesman, `s2.1-pro-free`)

Deploy `supabase/functions/generate-owl-stat` after setting `FISH_API_KEY`,
`AUDIO_BATCH_SECRET`, and optionally `FISH_OWL_VOICE_ID` (defaults to Fish
library voice `ec09398bbbb94b2ea46e83391ad7f49d` — Male / Old / Educational).

```sh
npx supabase functions deploy generate-owl-stat
node --env-file=supabase/.temp/audio-batch.env \
  scripts/owl-stats/render-owl-audio.mjs --sample 3
node --env-file=supabase/.temp/audio-batch.env \
  scripts/owl-stats/render-owl-audio.mjs
```

Clips land at `owl/{question_id}/v1.mp3` in the existing audio R2 bucket and
play through `/api/audio` (approved session required). The card still shows
the sentence and source link if a clip has not been rendered yet.
