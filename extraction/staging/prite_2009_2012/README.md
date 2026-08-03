# PRITE 2009–2012 staged import

These four files contain 300 OCR-reconciled questions per year, but they are
deliberately excluded from the production question bank because each supplied
PDF contains only three of the six official answer-key pages.

Official answers present in each year: 153 of 300. The supplied pages cover
global question ranges 1–51, 103–153, and 205–255. The missing official ranges
are therefore:

- Section 1, items 52–102 (global 52–102)
- Section 2, items 4–54 (global 154–204)
- Section 2, items 106–150 (global 256–300)

Null answers are intentional and carry the `missing_official_answer` flag. Do
not infer or medically guess them. When the missing official key pages are
available, rerun answer reconciliation and the fail-closed verification before
merging these years into `extraction/output/questions_all.json`.

The verification report confirms 300 sequential records per year, exact
153-row supplied-key coverage, sequential option labels, and answer-to-option
consistency for every supplied answer.
