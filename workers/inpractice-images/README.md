# inpractice-images — Worker

Serves the 5,096 "In practice" scenario illustrations from R2.

- **Live:** `https://inpractice-images.correllsoftware.workers.dev/i/<year>-<qindex>.webp`
  (e.g. `/i/2017-0032.webp`). `/healthz` returns `{ok, probe}`.
- **Bucket:** `inpractice-illustrations` — 5,096 objects, 477 MB, no `r2.dev` domain enabled.
  The Worker is the only entry point, which is what keeps the key-pattern check (and therefore
  "no listing, no traversal") enforceable.
- **Public, deliberately** — unlike `workers/textbook-images`, which is Supabase-gated because it
  serves copyrighted book pages. These are AI-generated originals from our own
  `clinical_application` text: no PRITE stems, no answers, no third-party copyright, no PII.
  Public is what lets the app use a plain `<img src>` instead of authenticated blob fetches, and
  it gets free edge caching. Decision made by Andrew 2026-08-03.
- **Cache:** `public, max-age=31536000, immutable`. Safe because the key encodes the question and
  an illustration never changes in place.

## Deploying

```bash
cd workers/inpractice-images
npx wrangler@3 deploy --config ./wrangler.toml
```

**`--config ./wrangler.toml` is required.** Without it wrangler walks up, finds the repo-root
`wrangler.jsonc` (which has `pages_build_output_dir`) and refuses with *"It looks like you've run a
Workers-specific command in a Pages project."* Same trap applies to `textbook-images`.

## Uploading

```bash
cd enrichment/illustrations/images/raw-mini-med
ls *.webp | xargs -P 8 -I{} ../../../../workers/inpractice-images/put_one.sh inpractice-illustrations {}
```

Then **always** audit — do not trust the uploader's stdout:

```bash
workers/inpractice-images/audit.sh > missing.txt   # empty file = complete
cd enrichment/illustrations/images/raw-mini-med
xargs -P 3 -I{} ../../../../workers/inpractice-images/put_one.sh inpractice-illustrations {} < missing.txt
```

### Gotchas paid for in this run

- **Never `tail` the uploader's output.** Under `xargs -P` the FAILED lines interleave, and a
  `tail -20` shows only the last few — it looked like everything after 2012-0285 had died when in
  fact 5,077 of 5,096 had succeeded and 19 had failed in one burst.
- **Do not estimate progress by binary-searching for a "frontier".** Failures leave gaps, so the
  search halts at the first hole and massively understates coverage (it reported 13% when the run
  was essentially done). `audit.sh` HEADs every key in ~1 min and is authoritative.
- `r2 object put` retries a transient bare 521; four attempts wasn't always enough under
  `-P 8`. The 19 stragglers all succeeded immediately at `-P 3`.
- wrangler v3 has **no `r2 object list`** — hence `audit.sh`.
- Each `npx wrangler` spawn costs ~2 s, so a full 5,096-object pass takes ~30-40 min at `-P 8`.
  If that ever needs to be faster, create an R2 API token in the dashboard and use
  `aws s3 sync` against the S3-compatible endpoint.

## App integration

`src/lib/ScenarioIllustration.tsx` builds the URL and renders the image; it is used in the
question view's "In practice" panel (click to zoom) and in the poll extras. Override the host with
`VITE_ILLUSTRATION_BASE` if the Worker ever moves.
