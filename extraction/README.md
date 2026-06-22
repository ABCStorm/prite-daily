# PRITE PowerPoint extraction

Turns the year-by-year PRITE `.pptx` decks into structured question records +
exported images that the website/database can consume.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install python-pptx
.venv/bin/python extract.py "/path/to/folder/of/decks" --out output
```

- `inspect_decks.py` — diagnostic: prints per-deck slide structure (used to
  design the parser; not needed for normal runs).
- `extract.py` — the extractor. Writes `output/questions_<year>.json`,
  `output/questions_all.json`, `output/review_needed.json`, and
  `output/images/<year>/*`.

## How it reads a deck

Slides are walked in order and classified:

- **Question** — a slide whose text has real option structure: ≥3 lettered
  options (`A.`/`B.`…, including concatenated `A.xB.y` and vertical-tab–
  separated variants), **or** an answer box plus 3–6 short unlettered bullets
  (the 2025 style, where the stem/options/answer may be in separate text boxes).
- **Explanation** — the slides that *follow* a question (images and/or written
  prose like `"Why B: …"`, `"Answer: B — …"`). Attached to the preceding
  question. A stem that *starts* with those markers is treated as explanation
  even if it re-lists the options.
- **Figure vs. on-slide reveal** — an image on the question slide is a genuine
  question **figure** (CT scan, MRI, pedigree) only if it has **no entrance
  animation**, i.e. it's visible immediately. Images with an "appear on click"
  animation are answer/explanation reveals (e.g. a pasted explanation
  screenshot) and are routed to `explanation_images` so they stay hidden until
  the user answers. Animation state is read from the slide's `<p:timing>` XML
  (python-pptx doesn't model it) — see `entrance_animated_spids()`.

## Output schema (per question)

```jsonc
{
  "deck": "2025 PRITE.pptx",
  "year": "2025",
  "q_index": 42,                 // order within the deck
  "slide_number": 86,
  "stem": "A 27-year-old man …",
  "options": [{ "letter": "A", "text": "…" }, …],
  "answer_letter": "B",          // first/primary correct letter (null if unknown)
  "answer_letters": ["B"],       // all correct letters (multi-select → >1)
  "multi_select": false,         // true for "select all that apply"
  "answer_text": "Serotonin syndrome",
  "answer_source": "letter",     // letter | multi | text-match | text-fuzzy | unmatched | none
  "answer_raw": "B. Serotonin syndrome",
  "explanation_text": "…",       // written explanation from following slides
  "figure_images": ["images/2025/2025_q042_fig_1.png"],
  "explanation_images": ["images/2025/2025_q042_exp87_1.png"],
  "flags": ["…"]
}
```

## Flags

**Informational** (not errors — no action needed):
- `options_unlettered` — choices printed without `A./B.` prefixes; letters
  assigned by position (common in 2016 and 2025).
- `multi_select` — a "select all that apply" question.
- `many_7_options` / `only_N_options` — option count outside the usual 4–5.
- `has_figure` — an immediately-visible figure image is shown with the question.
- `onslide_reveal` — the question slide also carried an animated (appear-on-click)
  image, routed to the explanation.
- `manual_corrected` — a hand fix from `corrections.json` was applied.

**Needs a human eye** (collected into `review_needed.json`):
- `no_answer` / `unmatched` — the answer box didn't resolve to an option.
- `text-fuzzy` — the answer matched an option only by partial text, not a letter.
- `few_options` — fewer than 4 options parsed.

## Current results (12 decks, 2014–2025)

~3,590 questions extracted; **1** with no resolved answer; **7 (0.2%)** flagged
for human review. 1,213 images exported (figures + explanations), all references
verified present on disk. Per-deck counts land within a few of the true ~300/yr.

The only known gap: a handful of 2025 questions print all options space-joined
on a single line (genuinely ambiguous to split) — these are flagged, not lost.
