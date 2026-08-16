#!/usr/bin/env python3

import unittest
import importlib.util
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("candidate_checker", HERE / "check-pubmed-candidates.py")
candidate_checker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(candidate_checker)
classify_fact = candidate_checker.classify_fact
review = candidate_checker.review


class CandidateCheckerTests(unittest.TestCase):
    def test_rejects_study_enrollment(self):
        self.assertIsNone(classify_fact("We randomly assigned 488 children aged 7 to 17 years to four treatment groups."))

    def test_rejects_historical_number(self):
        self.assertIsNone(classify_fact("Bright light therapy has been investigated for over 20 years."))

    def test_rejects_register_study_sample_sizes(self):
        self.assertIsNone(classify_fact(
            "Nationwide registers were used to compare mortality in 66 881 patients "
            "versus the total population of 5.2 million."
        ))

    def test_rejects_methods_timing(self):
        self.assertIsNone(classify_fact(
            "Blood samples were obtained within 1 hour of seizure; no significant "
            "differences were observed (P = .569)."
        ))

    def test_rejects_malformed_result_fragment(self):
        self.assertIsNone(classify_fact(
            "63 on placebo) and completed suicide (OR = 0.61; lithium 4 vs."
        ))

    def test_rejects_trial_description_with_incidental_baseline_rate(self):
        self.assertIsNone(classify_fact(
            "A randomized 2-year study comparing suicide risk was conducted in "
            "980 patients, 26.8 percent of whom were treatment refractory."
        ))

    def test_rejects_animal_result(self):
        self.assertIsNone(classify_fact(
            "Neurogenic plasma extravasation was inhibited by more than 80 percent in newborn rats."
        ))

    def test_rejects_animal_source_title(self):
        candidate = {
            "stem": "Where is corticotropin-releasing hormone secreted?",
            "answer": "Paraventricular nucleus",
            "topic": "Hypothalamus",
            "sentence": "Leptin increased CRH in the paraventricular nucleus by 38 percent.",
            "source_title": "Identification of targets of leptin action in rat hypothalamus.",
        }
        self.assertFalse(review(candidate, Counter(), 100)[0])

    def test_rejects_treatment_phase_description(self):
        self.assertIsNone(classify_fact(
            "Responders receiving 50 or 70 mg for 12 weeks were randomized to placebo "
            "or continued treatment during a 26-week phase."
        ))

    def test_rejects_unbalanced_fragment(self):
        candidate = {
            "stem": "Which treatment is effective?",
            "answer": "CBT",
            "topic": "Panic disorder",
            "sentence": "CBT response was 48 percent (compared with placebo.",
            "source_title": "CBT for panic disorder",
        }
        self.assertFalse(review(candidate, Counter(), 100)[0])

    def test_rejects_single_case_measurement(self):
        self.assertIsNone(classify_fact(
            "Following lumbar puncture with opening pressure of 350 mmHg, a diagnosis "
            "of pseudotumor cerebri was made and treatment was started."
        ))

    def test_accepts_prevalence(self):
        self.assertEqual(
            classify_fact("Parkinson disease affects 2 to 3 percent of adults aged 65 years and older."),
            "epidemiology",
        )

    def test_accepts_diagnostic_performance(self):
        self.assertEqual(
            classify_fact("CSF VDRL was positive in 73 percent of neurosyphilis cases."),
            "diagnostic performance",
        )

    def test_relevance_checker_rejects_unrelated_number(self):
        candidate = {
            "stem": "Which fibers carry taste from the anterior tongue?",
            "answer": "Chorda tympani",
            "topic": "Cranial nerve impairments",
            "sentence": "Late radiation findings included dysarthria in 76 percent of patients.",
            "source_title": "Late radiation injury after head and neck cancer treatment",
        }
        self.assertFalse(review(candidate, Counter(), 100)[0])


if __name__ == "__main__":
    unittest.main()
