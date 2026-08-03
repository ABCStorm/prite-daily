# PRITE Daily audio batch tools

These scripts generate the short teaching sentence first, checkpoint every
result, and leave Fish rendering as a separate resumable stage. No API key is
stored in the repository.

## 1. Generate teaching sentences with the authenticated Codex CLI

From the PRITE Daily repository root:

```sh
node scripts/audio/generate-audio-scripts.mjs --sample 15
node scripts/audio/generate-audio-scripts.mjs --batch-size 50 --reasoning-effort low
```

For two resumable parallel processes, use `--shard 0/2` and `--shard 1/2`
with separate `--state` paths and the same append-only `--output` path. Shards
are deterministic and never select the same source ID.

The first command creates a representative review set. The second resumes the
same append-only `extraction/output/audio_scripts.jsonl` and fills the complete
bank in batches of 25.

Each line has this shape:

```json
{"question_id":"2014-1","script":"Attunement is ...","generated_at":"...","engine":"codex"}
```

Progress and the latest error per question are written atomically to
`extraction/output/audio_scripts.state.json`. Re-running either command skips
valid completed IDs. Use `--max-batches 1` for a one-batch smoke test.

The script invokes the already-authenticated `codex exec` command. It builds a
strict schema for each batch that requires every exact question ID, so missing
or extra records are rejected before the result is checkpointed. It does not
read or write an OpenAI API key.

Audit the completed checkpoint before rendering:

```sh
node scripts/audio/audit-audio-scripts.mjs \
  --report extraction/output/audio_scripts.audit.json
```

Generate the separate open-ended spoken questions with the same authenticated
Codex session (still no API key):

```sh
node scripts/audio/generate-audio-scripts.mjs \
  --kind prompt \
  --output extraction/output/audio_prompts.jsonl \
  --state extraction/output/audio_prompts.state.json \
  --batch-size 50 \
  --reasoning-effort low
```

Prompt generation removes the choices and rewrites each item as one concise,
self-contained question. It uses the verified answer only to understand what
the question must test; the answer is never included in the prompt.

## 2. Render and store Fish audio

Deploy the accompanying `generate-audio-drill` Edge Function after configuring
`FISH_API_KEY` and a high-entropy `AUDIO_BATCH_SECRET`. The included
`configure-audio-batch-secret.mjs` creates the secret, configures Supabase, and
saves the runner values to the already-ignored
`supabase/.temp/audio-batch.env` with owner-only permissions. The function
accepts the prewritten teaching sentence; it does not call Anthropic or another
text model.

The renderer calls the single-item function with bounded concurrency and
exponential retry/backoff:

```sh
node scripts/audio/configure-audio-batch-secret.mjs
node --env-file=supabase/.temp/audio-batch.env scripts/audio/render-fish-audio.mjs --sample 3 --verify-dir /tmp/prite-audio-pilot
node --env-file=supabase/.temp/audio-batch.env scripts/audio/render-fish-audio.mjs
```

The three-item command is the required phone/browser pilot. The full command
resumes from `extraction/output/audio_render.state.json`; the Edge Function
also returns already-cached rows without making another Fish request.
Verification downloads use two-minute signed URLs and are only enabled for a
sample run; signed URLs are never written into the state file.
Use `--ids 2015-116,2020-4` for targeted verification or repair runs.

Each prompt clip contains the open-ended question without multiple-choice
options. The answer remains a separate clip so the client can provide a real,
adjustable recall pause. Only prompt clips are rerendered for this change; the
existing teaching-point answer clips are reused. Clips
use 64 kbps MP3: the free S2.1 endpoint was empirically found to ignore the
requested 24 kbps Opus bitrate and return roughly 270 kbps files.
Prompt rendering is versioned in its storage path; changing the prompt format
causes one automatic replacement without making later resume runs regenerate
valid current-version clips.

## 3. Build single-file offline programs

The export builder downloads the cached clips through short-lived signed URLs,
joins them with real four-second thinking pauses and one-second transitions,
uploads each finished MP3 through a short-lived signed Storage URL, and writes the web manifest at
`public/data/audio_exports.json`.
Each topic and the complete library are produced at 1x, 1.25x, 1.5x, and 2x;
the faster files are real retimed MP3s, so their speed works in any offline
player rather than depending on player-specific metadata.

```sh
node --env-file=supabase/.temp/audio-batch.env \
  scripts/audio/build-audio-exports.mjs
```

It is safe to restart: finished source clips, local programs, and uploaded
objects are reused. Use `--scope all` or a topic slug for one export, and
`--download-only` to populate the local clip cache without building.
