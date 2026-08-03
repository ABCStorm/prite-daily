# "In practice" illustrations — pipeline

One illustration per `clinical_application` scenario (5,096 of the 5,100 questions have one), so a
resident can picture the patient and the room instead of only reading about them.

Image model: **OpenAI `gpt-image-1-mini`**, `quality=low`, `1024x1024`, WebP — **$0.005/image**,
so a full pass is **~$25** and a re-roll of a bad 10% is ~$2.50.

## Data locations

| What | Where |
|---|---|
| Question bank (source of truth) | `extraction/output/questions_all.json` — **not** `public/data/questions.json`, which is the deliberate 2-byte `[]` stub (see HANDOFF.md) |
| Authored prompts | `enrichment/illustrations/prompts.json` (id → `{prompt, alt, model}`) |
| Generated images | `enrichment/illustrations/images/<arm>/<id>.webp` |
| Refusals + errors | `enrichment/illustrations/errors.jsonl` |
| Token usage per image | `enrichment/illustrations/usage.jsonl` |
| Blinded scores | `enrichment/illustrations/scores.json` |

`id` is `<year>-<zero-padded q_index>` (`qid()` in `lib.mjs`) — `q_index` alone repeats across decks.

Nothing here mutates `questions_all.json`. Prompts live in their own file, the same way the K&S
citations do, so a concurrent session editing the bank can never conflict with a running pass.

## The three arms

Every arm gets the **same house style string appended** (`STYLE` in `lib.mjs`), so a comparison
isolates the prompt body and nothing else.

| Arm | Prompt body | Cost of the prompt |
|---|---|---|
| `raw` | the whole "In practice" paragraph, verbatim (~950 chars) | free |
| `lead` | its first sentence, extracted by regex (~140 chars) | free |
| `llm` | a 25–45 word scene prompt written by Haiku | subscription only, no API spend |

The `lead` arm exists because it is a genuinely strong free baseline: 3,700 of the 5,096 scenarios
open with a scene-setting sentence ("A resident evaluates a fourth-grade student whose…"). If `lead`
ties `llm`, skip the authoring step entirely.

## Running it

```bash
# 1. author prompts (subscription, no API key needed). Resumable, safe to Ctrl-C.
node scripts/illustrations/build-prompts.mjs --sample 12      # pilot
node scripts/illustrations/build-prompts.mjs --jobs 8         # all 5,096, ~1.5-3 h

# 2. see exactly what would be sent, and what it would cost, before spending anything
node scripts/illustrations/gen-images.mjs --arm all --sample 12 --dry-run

# 3. generate. --arm all runs the A/B/C; --arm llm is the production run.
OPENAI_API_KEY=sk-... node scripts/illustrations/gen-images.mjs --arm all --sample 12

# 4. blinded scoring, then a human-readable side-by-side
node scripts/illustrations/judge.mjs --sample 12
node scripts/illustrations/contact-sheet.mjs --sample 12
open enrichment/illustrations/compare.html
```

`--sample N` is a **seeded** shuffle, so every script sees the identical N scenarios and a larger N
is a superset of a smaller one — a `--sample 12` run reuses the work already done for `--sample 8`.

## ✅ FULL RUN COMPLETE — 5,096 / 5,096 images, 2026-08-03

`enrichment/illustrations/images/raw-mini-med/` — **477 MB**, 94 KB avg WebP, no zero-byte files,
every id in the bank covered. Config: `--arm raw --quality medium --label raw-mini-med`,
gpt-image-1-mini, illustration style.

**Spend: $55.79 generation + ~$4 on the three comparison rounds = ~$60.**
4 h 20 min at `--jobs 6` (3.1 s/image sustained).

Recovery arithmetic, for anyone re-running this: 5,029 landed on the first pass; 12 transport
failures + 5 refusals cleared on a plain re-run; 25 of the remaining 26 refusals cleared through
`build-prompts.mjs --ids <blocked>` then `--arm llm`; the last one (2022-0084, Tanner staging in a
13-year-old) needed a hand-written prompt in `prompts.json` because even the authored version
tripped the filter on "13-year-old boy" next to "pubertal development". Final refusal rate on the
raw arm was **0.6%**, far below the 35%-sensitive-content share of the bank.

**Still to do:** hosting (R2 + gated Worker, mirroring `workers/textbook-images/`) and app UI.
Neither exists yet.

## RESULTS (2026-08-03) — read this before re-planning anything

**Prompt A/B/C (n=24, blinded Sonnet judge): the short authored prompts LOST.**
raw 2.99 / lead 2.67 / llm 2.68 overall; head-to-head 10 / 5 / 4; usable (usefulness>=4)
7/23 vs 2/23 vs 2/24. The 25-45 word spec stripped the discriminative clinical detail (the
light-therapy box, the tremor, the head bandage) and replaced it with a staged template.
**Use `--arm raw`. Do not rebuild the brevity-optimised authoring step.** `prompts.json` is kept
only for the refusal-recovery path below.

**Model bake-off (same 24 scenarios, same raw prompts):**

| model | fidelity | plaus | craft | usefulness | overall | wins | usable | full run |
|---|---|---|---|---|---|---|---|---|
| gpt-image-1-mini `low` | 2.63 | 3.38 | 3.17 | 2.58 | 2.94 | 4 | 7/24 | $25 |
| **gpt-image-1-mini `medium`** | **3.04** | **3.54** | **3.67** | **3.04** | **3.32** | **14** | **11/24** | **$56** |
| Imagen 4 Fast | 1.30 | 1.48 | 1.78 | 1.09 | 1.41 | 0 | 0/23 | $102 |

**Imagen 4 Fast is disqualified, not merely worse.** 19 of 23 images came back with rendered text:
it reads the didactic paragraph as a request for an annotated textbook poster and fills the frame
with garbled pseudo-lettering ("rhabdomoolysic arrhythming"), ignoring the style string's explicit
no-text instruction. It also returns PNG only — 830 KB/image, ~4.2 GB for the bank vs ~480 MB of
WebP — and the free-tier Gemini key throws `RESOURCE_EXHAUSTED` above `--jobs 1`.

**Ship setting: `--arm raw --quality medium`, ~$56.** The $31 over `low` buys +0.46 usefulness and
11 usable vs 7 out of 24.

## Round 3 RESULT — photorealism makes it WORSE. Stay on the illustration style.

Clean blinded run, n=93, `--jobs 3` (see the concurrency gotcha below):

| variant | fidelity | plaus | craft | usefulness | overall | wins | usable | generic_stock |
|---|---|---|---|---|---|---|---|---|
| **raw-mini-med (illustration)** | **3.13** | 3.67 | 3.63 | **3.08** | **3.38** | **14** | **11/24** | 10/24 |
| photo-mini-med (same model, photo style) | 2.30 | 3.65 | 3.57 | 2.17 | 2.92 | 5 | 3/23 | **19/23** |
| photo-flux-schnell | 1.54 | 2.46 | 3.04 | 1.46 | 2.13 | 0 | 0/24 | 23/24 |
| photo-flux-krea | 1.59 | 2.45 | 3.18 | 1.59 | 2.20 | 1 | 1/22 | 20/22 |

Two separate findings:

1. **Photorealism costs fidelity on the SAME model.** Swapping only the style string
   (`IMAGE_STYLE=photo`) drops gpt-image-1-mini medium from 3.13 to 2.30 fidelity and nearly doubles
   `generic_stock` (10 → 19 of 24). Photoreal output converges on stock-photography clichés; the
   illustration style keeps the frame on the specific clinical action.
2. **Open-weight models are far behind on prompt adherence**, which is the only thing that matters
   for 900-character clinical prose. FLUX schnell/Krea render attractive photographs of the *wrong
   scene* — `wrong_setting` on 15 and 11 images respectively. Neither reached one usable image.

**SDXL (`fal-ai/fast-sdxl`) is disqualified on content, not score.** It ignores the illustration
style entirely and renders photoreal. On 2019-0039 (anorexia, BMI 13) it produced a photorealistic
emaciated young woman in a tank top and underwear, alone, no clinician — functionally a
thinspiration image inside a psychiatry study app. The illustration style is doing safety work, not
just aesthetic work: it keeps every image unmistakably a drawing and centred on the clinical
encounter. Weigh this above any score before anyone revisits photorealism.

Also measured: HiDream-I1 full takes **7.8 min per 24 images** (~28 h for the bank vs ~4 h on
gpt-image-1-mini) and Imagen/HiDream/SDXL all return PNG at 640-850 KB.

### Gotchas from this round

- **`judge.mjs --jobs 6` over 160 images fails catastrophically** — 132 of 160 calls died and the
  arms came back with n=1..7, which looks like a result rather than a crash. `--jobs 3` scored
  93/93 clean. Never `tail` the judge's output when you need to see failures.
- **fal is prepaid and Krea/HiDream are 8-10x schnell's price.** A $5 top-up did not survive two
  24-image rounds; both ended in 403 "Exhausted balance" partway through.
- The cost line under-reported fal spend until `FAL_PRICE` was added -- it priced every fal model at
  schnell's $0.003.

## Round 3 setup — photoreal open-weight models

`FAL_KEY` (in `AcademicChallengeWiki/.env`) authenticates fine but the account balance is $0:
every model returns **403 "User is locked. Reason: Exhausted balance."** Top up at
fal.ai/dashboard/billing; the four-model round below costs about **$1.20**.

Model ids verified live by probe on 2026-08-03 (403 = exists + key valid; 404 = wrong id):

| label | fal id | ~$/img | note |
|---|---|---|---|
| `raw-flux-schnell` | `fal-ai/flux/schnell` | 0.003 | Apache 2.0, no licence strings |
| `raw-flux-krea` | `fal-ai/flux/krea` | 0.025 | photoreal-tuned; **dev licence = non-commercial** |
| `raw-hidream` | `fal-ai/hidream-i1-full` | ~0.03 | `-fast` and `-dev` variants also live and cheaper |
| `raw-sdxl` | `fal-ai/fast-sdxl` | ~0.005 | older, still photoreal with a good prompt |

`fal-ai/flux-krea` and `fal-ai/stable-diffusion-xl` are **404 — do not use those ids.**

```bash
K=$(grep -h '^FAL_KEY=' ../AcademicChallengeWiki/.env | cut -d= -f2-)
for m in "flux/schnell:raw-flux-schnell" "flux/krea:raw-flux-krea" \
         "hidream-i1-full:raw-hidream" "fast-sdxl:raw-sdxl"; do
  FAL_KEY=$K node scripts/illustrations/gen-images.mjs --provider fal \
    --model "fal-ai/${m%%:*}" --label "${m##*:}" --arm raw --sample 24 --jobs 4
done
node scripts/illustrations/judge.mjs --sample 24 --out scores-photoreal.json \
  --dirs raw-mini-med,raw-flux-schnell,raw-flux-krea,raw-hidream,raw-sdxl
node scripts/illustrations/contact-sheet.mjs --sample 24 --scores scores-photoreal.json \
  --out compare-photoreal.html \
  --dirs raw-mini-med,raw-flux-schnell,raw-flux-krea,raw-hidream,raw-sdxl
```

`raw-mini-med` is carried into the comparison as the incumbent to beat.

## Measured so far (2026-08-03)

- **Prompt authoring throughput**: 92 prompts in 188 s at `--batch 20 --jobs 4` = **0.49/s**.
  Full bank ≈ **2.9 h at `--jobs 4`**, ≈1.5 h at `--jobs 8`. 100 prompts written and on disk.
- **Authored prompt length**: 26 / 30 / 37 words (p10/p50/p90) — inside the 25–45 word target.
- **Image A/B/C: not yet run — needs `OPENAI_API_KEY`.** Nothing else is blocking.

## Why the authoring step is likely to earn its keep

Three things the raw paragraph does badly, visible in `--dry-run` output:

1. **Most of the paragraph is not depictable.** "Efficacy trials use tightly selected patients …
   STAR*D … pragmatic outcomes" has no scene in it at all. An image model given 950 chars of
   didactic prose averages the whole thing into generic hospital mush.
2. **35% of scenarios (1,777) contain content the image API's default filter dislikes** —
   suicide/self-harm wording (521), violence/restraint/abuse (410), a distressed child (881),
   injection drug use (165). The authoring prompt redirects those to the *clinical encounter*
   (the safety conversation, the family meeting) rather than the act, which is both the right image
   for a study app and what avoids refusals. `gen-images.mjs` logs every refusal to `errors.jsonl`,
   so the blocked rate per arm is measured rather than assumed.
3. **The teaching point is usually in the middle of the paragraph, not the opening sentence** — the
   `lead` arm's known weakness, and the thing the A/B is there to size.

## Gotchas

- `claude -p --system-prompt … --max-turns 1` is the authoring engine. Do **not** add `--bare`:
  it forces `ANTHROPIC_API_KEY` auth and this repo relies on the subscription OAuth session.
- `moderation: "low"` is set deliberately. The default filter treats ordinary psychiatric content
  as unsafe; `low` is the documented setting for clinical material.
- `output_format: "webp"` + `output_compression: 80` comes back at roughly a tenth of PNG size, so
  no `sharp` dependency and no post-processing step.
- The judge is genuinely discriminating, not a rubber stamp — a smoke test on a flat teal square
  scored 1/1/2/1 with `empty_or_abstract`.
- **Hosting is not solved here.** ~5,100 WebPs is a lot of files to add to a Cloudflare Pages
  deployment; the R2 + Worker path already built for `workers/textbook-images/` is the likelier
  home. Images in this repo's `enrichment/` dir are working files, not the ship path.
