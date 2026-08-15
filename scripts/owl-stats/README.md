# Wise owl statistics

A perched owl on every question card speaks one **verified** statistic about
the current item and links the public source.

Numbers are never invented. `canonical.py` is the only place a figure may be
introduced, and every entry has a `source_url`. The builder only *assigns*
those facts and writes a unique spoken sentence.

## Rebuild the 5,100 sentences

```sh
python3 scripts/owl-stats/build-owl-stats.py
```

Writes `public/data/owl_stats.json` (the client bundle) and
`public/data/owl_stats.report.json` (coverage).

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
