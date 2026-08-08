# AnKing + Sketchy image matching

Match diagrams from AnKing / AnkiHub Extra (and First Aid) fields, and Sketchy
panels from Sketchy / Sketchy 2 / Sketchy Extra fields, onto PRITE Daily questions.

## Sources

Put these under `~/Downloads/` (already used by the script):

- `step 1 psych with sketchy images.apkg`
- `step 1 neuro with sketchy images.apkg`
- `step 2 neuro with sketchy images.apkg`
- `step 2 notes with sketchy images.apkg`

Media binaries are resolved from the local Anki collection:

`~/Library/Application Support/Anki2/Andrew's Macbook Pro profile/collection.media`

## Run

```bash
# Full extract + match + patch questions_all.json
python3 scripts/anking-images/extract_and_match.py

# Faster re-match using cached catalog
python3 scripts/anking-images/extract_and_match.py --skip-extract --sample 20 --no-write-questions

# Tune precision
python3 scripts/anking-images/extract_and_match.py --skip-extract --min-score 14 --min-jaccard 0.10
```

Outputs:

| Path | Purpose |
|------|---------|
| `enrichment/anking-images/notes_catalog.json` | De-duplicated AnKing notes with image lists |
| `enrichment/anking-images/matches.json` | `year-q` → match metadata + image filenames |
| `enrichment/anking-images/media/` | Hardlinked/copied files used by matches |
| `extraction/output/questions_all.json` | Adds `anking_images`, `sketchy_images`, `anking_match` |

## Serve (auth-gated)

Images are copyrighted third-party assets. Serve only behind Supabase auth:

```bash
# Create private R2 bucket once (dashboard or):
#   npx wrangler@3 r2 bucket create anking-sketchy-images

cd workers/resource-images
npx wrangler@3 secret put SUPABASE_ANON_KEY --config ./wrangler.toml
npx wrangler@3 deploy --config ./wrangler.toml

# Upload media (only files referenced by matches)
cd ../../enrichment/anking-images/media
# Prefer only files in matches.json:
python3 - <<'PY'
import json, subprocess
from pathlib import Path
m = json.loads(Path('../matches.json').read_text())
names = set()
for v in m.values():
    names.update(v.get('anking_images') or [])
    names.update(v.get('sketchy_images') or [])
Path('_upload_list.txt').write_text('\n'.join(sorted(names)))
print(len(names), 'files')
PY
xargs -P 6 -I{} ../../../workers/resource-images/put_one.sh {} < _upload_list.txt
```

Worker: `https://resource-images.correllsoftware.workers.dev/{anking|sketchy}/<filename>`

## App fields

- `anking_images: string[]` — Extra / AnKing / AnkiHub (+ First Aid) diagrams  
- `sketchy_images: string[]` — Sketchy field panels  
- `anking_match` — score, text preview, entities (for UI caption)

After patching the bank, re-gzip and upload `questions.json.gz` to the private
`bank` bucket (see HANDOFF.md).
