import assert from "node:assert/strict";
import test from "node:test";
import { dynPerspectiveExclusionReason, isDynPerspectiveEligible } from "./eligibility.mjs";

test("removes free-standing statistics and research-method questions", () => {
  assert.equal(isDynPerspectiveEligible({ stem: "The statistical term number needed to treat refers to the number of patients who need to be treated in order to:", prite_category: "research_stats" }), false);
  assert.match(dynPerspectiveExclusionReason({ stem: "A researcher compares cases and controls. This is which study design?" }), /research\/statistics/);
  assert.equal(isDynPerspectiveEligible({ stem: "In a skewed distribution, which measure of central tendency moves furthest from the mode?", prite_category: "research_stats" }), false);
});

test("removes free-standing biomedical recall", () => {
  assert.equal(isDynPerspectiveEligible({ stem: "LSD and mescaline show agonism at which receptor?", prite_category: "neuro_sci" }), false);
  assert.equal(isDynPerspectiveEligible({ stem: "Which brain structure contains these dopaminergic cell bodies?", prite_category: "neuro_sci" }), false);
});

test("keeps actual patient-care vignettes even when they contain science", () => {
  assert.equal(isDynPerspectiveEligible({ stem: "A 62-year-old patient presents with lethargy after starting paroxetine. Serum sodium is 117 mEq/L. Which test confirms the diagnosis?", prite_category: "somatic_tx" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "A 17-year-old is brought to the emergency department with rigidity and tremor. Which laboratory test should the clinician order?", prite_category: "neurology" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "During an initial office evaluation, the patient tells the psychiatrist, 'My spouse told me I had to be evaluated.' Which is the most empathic response?", prite_category: "neuro_sci" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "A patient undergoes an examination after an acute stroke. Which brain region is affected?", prite_category: "neurology" }), true);
});

test("keeps psychotherapy and psychologically meaningful theory questions", () => {
  assert.equal(isDynPerspectiveEligible({ stem: "From a cognitive-behavioral perspective, which factor is most responsible for major depression?", prite_category: "psychotherapy" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "According to Kohut, which trait is normal in childhood?", prite_category: "behavioral_sci" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "Which defense mechanism is demonstrated?", prite_category: "psychotherapy" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "A patient in a research study changes their mind. Which informed consent principle applies?", prite_category: "research_stats" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "In documenting a suicide risk assessment, what should be discussed in the record?", prite_category: "research_stats" }), true);
  assert.equal(isDynPerspectiveEligible({ stem: "Which is a risk factor for child abuse?", prite_category: "epidemiology" }), true);
});
