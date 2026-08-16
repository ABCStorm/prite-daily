#!/usr/bin/env python3

import unittest

from eligibility import assignment_eligible, meaningful_number


LITHIUM = {
    "id": "lithium-range",
    "core": "maintenance serum lithium levels are usually 0.6 to 1.2 mEq/L, with toxicity more likely above 1.5 mEq/L",
    "diagnoses": ["bipolar"],
    "medications": ["lithium"],
    "keywords": ["lithium", "level", "serum", "toxicity", "tremor"],
}
ADHD = {
    "id": "nimh-adhd",
    "core": "ADHD affected 11.4 percent of U.S. children ages 3 to 17 in 2022",
    "diagnoses": ["adhd"],
    "medications": [],
    "keywords": ["adhd", "attention-deficit"],
}
CANONICAL = {s["id"]: s for s in (LITHIUM, ADHD)}


class EligibilityTests(unittest.TestCase):
    def test_requires_a_real_number(self):
        self.assertFalse(meaningful_number("Supportive psychotherapy is often useful."))
        self.assertTrue(meaningful_number("ADHD affected 11.4 percent of children."))
        self.assertTrue(meaningful_number("Capacity has four component abilities."))

    def test_rejects_meta_exam_number(self):
        self.assertFalse(meaningful_number("Half the psychodynamics questions test transference."))

    def test_lithium_requires_lithium_relevance(self):
        row = {"stat_id": "lithium-range", "sentence": LITHIUM["core"]}
        unrelated = {"year": 2024, "q_index": 1, "stem": "Which serum antibody supports stiff-person syndrome?", "answer_text": "Anti-GAD65"}
        related = {"year": 2024, "q_index": 2, "stem": "Which serum lithium level suggests toxicity?", "answer_text": "Above 1.5 mEq/L"}
        self.assertFalse(assignment_eligible(unrelated, row, CANONICAL)[0])
        self.assertTrue(assignment_eligible(related, row, CANONICAL)[0])

    def test_adhd_prevalence_matches_adhd_question(self):
        row = {"stat_id": "nimh-adhd", "sentence": ADHD["core"]}
        q = {"year": "therapy", "q_index": 9, "stem": "A child with ADHD starts parent management training.", "answer_text": "Behavioral parent training"}
        self.assertTrue(assignment_eligible(q, row, CANONICAL)[0])

    def test_unrelated_neuro_paper_is_rejected(self):
        row = {
            "stat_id": "pmid-23640737",
            "sentence": "Late findings included dysarthria in 76 percent and cranial neuropathy in 48 percent of patients.",
        }
        q = {
            "year": "Kaufman", "q_index": 4,
            "stem": "Which fibers carry taste from the anterior tongue?",
            "answer_text": "Chorda tympani",
            "kaufman": {"chapter": "Cranial Nerve Impairments"},
        }
        self.assertFalse(assignment_eligible(q, row, CANONICAL)[0])


if __name__ == "__main__":
    unittest.main()
