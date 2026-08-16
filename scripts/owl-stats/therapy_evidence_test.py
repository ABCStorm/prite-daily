#!/usr/bin/env python3

import unittest

from eligibility import meaningful_number, paper_relevant
from therapy_evidence import FACTS


class TherapyEvidenceTests(unittest.TestCase):
    def test_every_fact_is_quantitative_and_sourced(self):
        for fact in FACTS:
            with self.subTest(fact=fact["id"]):
                self.assertTrue(meaningful_number(fact["sentence"]))
                self.assertTrue(fact["source_url"].startswith("https://pubmed.ncbi.nlm.nih.gov/"))

    def test_modality_is_independently_recognized(self):
        q = {
            "year": "ACT technique", "q_index": 1,
            "stem": "Which ACT response best demonstrates defusion?",
            "answer_text": "I am having the thought that I will fail",
            "quizapine": {"modality": "ACT", "topic": "Defusion"},
        }
        fact = next(f for f in FACTS if f["id"] == "therapy-act-effect")
        self.assertTrue(paper_relevant(q, fact["sentence"])[0])

    def test_unrelated_modality_is_rejected(self):
        q = {
            "year": "DBT skills", "q_index": 1,
            "stem": "Which DBT skill is being used?", "answer_text": "Opposite action",
            "quizapine": {"modality": "DBT", "topic": "Emotion regulation"},
        }
        fact = next(f for f in FACTS if f["id"] == "therapy-act-effect")
        self.assertFalse(paper_relevant(q, fact["sentence"])[0])

    def test_every_psychodynamic_fact_requires_question_anchors(self):
        psychodynamic = [fact for fact in FACTS if "Psychodynamic" in fact["modalities"]]
        self.assertTrue(psychodynamic)
        for fact in psychodynamic:
            with self.subTest(fact=fact["id"]):
                self.assertTrue(fact.get("anchors"))


if __name__ == "__main__":
    unittest.main()
