# Psychodynamic perspectives

A dog analyst on the top-left of clinically relevant question cards offers a
psychodynamic formulation. Pure statistics, research methods, receptor science,
neuroanatomy, genetics, and other biomedical recall questions without a real
patient-care scenario are deliberately omitted; see `eligibility.mjs`.

Formulations come from `canonical.py` only. The builder assigns the best match
and writes a unique spoken sentence.

```sh
npm run dyn:stats
npx supabase functions deploy generate-dyn-stat
node --env-file=supabase/.temp/audio-batch.env \
  scripts/dyn-perspectives/render-dyn-audio.mjs --sample 3
node --env-file=supabase/.temp/audio-batch.env \
  scripts/dyn-perspectives/render-dyn-audio.mjs
```

Clips land at `dyn/{question_id}/v1.mp3`. Voice defaults to Fish
`39b8d8987cc849feafb9932b595c6bb8` (Mature Academic — distinct from the owl).
