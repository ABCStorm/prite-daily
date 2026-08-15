# Psychodynamic perspectives

A fox analyst on the top-left of every question card offers one **sourced**
psychodynamic formulation and links the public source.

Formulations come from `canonical.py` only. The builder assigns the best match
and writes a unique spoken sentence.

```sh
python3 scripts/dyn-perspectives/build-dyn-perspectives.py
npx supabase functions deploy generate-dyn-stat
node --env-file=supabase/.temp/audio-batch.env \
  scripts/dyn-perspectives/render-dyn-audio.mjs --sample 3
node --env-file=supabase/.temp/audio-batch.env \
  scripts/dyn-perspectives/render-dyn-audio.mjs
```

Clips land at `dyn/{question_id}/v1.mp3`. Voice defaults to Fish
`39b8d8987cc849feafb9932b595c6bb8` (Mature Academic — distinct from the owl).
