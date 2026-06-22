#!/usr/bin/env python3
"""
Multi-dimensional tagging of every PRITE question. Heuristic keyword extraction
across several label dimensions, plus a scored PRITE-category assignment. Writes
`prite_category`, `prite_label`, and a `tags` object (diagnosis, medication,
psychotherapy, neuro, historical, setting) back into the questions JSON.

Difficulty + high-yieldness are NOT set here — difficulty is derived from the
class miss-rate at analytics time, and high-yield from the blueprint weights.
Question-type and richer setting tagging are left for the AI pass.

Usage:
  python classify.py output/questions_all.json
"""
import sys
import re
import json
import collections

# ---------------------------------------------------------------------------
# Entity dictionaries: canonical tag -> regex of surface forms.
# ---------------------------------------------------------------------------
MEDICATIONS = {
    "lithium": r"lithium", "valproate": r"valpro|divalproex", "lamotrigine": r"lamotrigine",
    "carbamazepine": r"carbamazepine", "clozapine": r"clozapine", "olanzapine": r"olanzapine",
    "risperidone": r"risperidone|paliperidone", "quetiapine": r"quetiapine", "aripiprazole": r"aripiprazole",
    "haloperidol": r"haloperidol", "chlorpromazine": r"chlorpromazine", "ziprasidone": r"ziprasidone",
    "lurasidone": r"lurasidone", "fluoxetine": r"fluoxetine", "sertraline": r"sertraline",
    "paroxetine": r"paroxetine", "escitalopram": r"escitalopram", "citalopram": r"citalopram",
    "fluvoxamine": r"fluvoxamine", "venlafaxine": r"venlafaxine|desvenlafaxine", "duloxetine": r"duloxetine",
    "bupropion": r"bupropion", "mirtazapine": r"mirtazapine", "trazodone": r"trazodone",
    "imipramine": r"imipramine", "nortriptyline": r"nortriptyline", "amitriptyline": r"amitriptyline",
    "clomipramine": r"clomipramine", "phenelzine": r"phenelzine|tranylcypromine|MAOI",
    "benzodiazepine": r"benzodiazepine|diazepam|lorazepam|clonazepam|alprazolam",
    "buspirone": r"buspirone", "methylphenidate": r"methylphenidate", "amphetamine": r"amphetamine|adderall|lisdexamfetamine",
    "atomoxetine": r"atomoxetine", "naltrexone": r"naltrexone", "buprenorphine": r"buprenorphine|suboxone",
    "methadone": r"methadone", "acamprosate": r"acamprosate", "disulfiram": r"disulfiram",
    "naloxone": r"naloxone", "donepezil": r"donepezil|rivastigmine|galantamine", "memantine": r"memantine",
    "propranolol": r"propranolol", "prazosin": r"prazosin", "gabapentin": r"gabapentin|pregabalin",
    "ketamine": r"ketamine|esketamine", "modafinil": r"modafinil", "guanfacine": r"guanfacine|clonidine",
    "stimulant": r"\bstimulant", "antipsychotic": r"antipsychotic|neuroleptic", "antidepressant": r"antidepressant|\bSSRI\b|\bSNRI\b|tricyclic",
    "mood-stabilizer": r"mood stabiliz", "ECT": r"\bECT\b|electroconvulsive",
    "TMS": r"\bTMS\b|transcranial magnetic", "VNS": r"vagus nerve stim",
}

DIAGNOSES = {
    "schizophrenia": r"schizophreni", "schizoaffective": r"schizoaffective",
    "brief-psychotic": r"brief psychotic|schizophreniform", "psychosis": r"\bpsychosis|psychotic",
    "bipolar": r"bipolar|manic episode|\bmania\b|hypomani", "major-depression": r"major depress|\bMDD\b",
    "persistent-depressive": r"dysthym|persistent depressive", "panic": r"panic disorder|panic attack",
    "phobia": r"specific phobia|agoraphobia|social anxiety|social phobia", "GAD": r"generalized anxiety",
    "OCD": r"obsessive-?compulsive|\bOCD\b", "hoarding": r"hoarding", "BDD": r"body dysmorphic",
    "PTSD": r"posttraumatic|\bPTSD\b|acute stress disorder", "adjustment": r"adjustment disorder",
    "dissociative": r"dissociat|depersonalization|derealization|dissociative identity",
    "somatic-symptom": r"somatic symptom|conversion disorder|functional neurolog|illness anxiety",
    "factitious": r"factitious|munchausen|malingering", "anorexia": r"anorexia nervosa",
    "bulimia": r"bulimia|binge[- ]eating", "insomnia": r"insomnia", "narcolepsy": r"narcolepsy|cataplexy",
    "sleep-apnea": r"sleep apnea", "rls": r"restless leg|periodic limb",
    "sexual-dysfunction": r"erectile|sexual dysfunction|premature ejaculation|hypoactive sexual",
    "gender-dysphoria": r"gender dysphoria|gender identity", "paraphilia": r"paraphili|pedophil|exhibitionis|voyeur|fetish",
    "conduct": r"conduct disorder|oppositional defiant", "impulse-control": r"intermittent explosive|kleptomania|pyromania",
    "substance-use": r"substance[- ]use|alcohol use|opioid use|cannabis|cocaine|stimulant use|withdrawal|intoxication|dependence",
    "delirium": r"delirium", "dementia": r"\bdementia|major neurocognitive|alzheimer|lewy body|frontotemporal|vascular dementia",
    "personality-disorder": r"personality disorder|borderline|narcissistic|antisocial|histrionic|schizotypal|avoidant personality|obsessive-compulsive personality|dependent personality|paranoid personality|schizoid",
    "autism": r"autism|autistic|asperger", "adhd": r"\bADHD\b|attention-?deficit",
    "intellectual-disability": r"intellectual disability|mental retardation", "tic": r"\btic\b|tourette",
    "elimination": r"enuresis|encopresis", "delusional": r"delusional disorder",
    "dyspareunia": r"dyspareunia|genito-?pelvic|vaginismus", "parasomnia": r"sleepwalk|night terror|sleep terror|parasomnia|REM sleep behavior|nightmare disorder",
    "premenstrual": r"premenstrual|postpartum|perinatal", "grief": r"\bgrief\b|bereave|complicated mourning|prolonged grief",
}

PSYCHOTHERAPY = {
    "CBT": r"cognitive[- ]behavioral|\bCBT\b|cognitive therapy|cognitive restructuring",
    "DBT": r"dialectical|\bDBT\b", "exposure": r"exposure (therapy|and response|response prevention)|systematic desensitiz|flooding",
    "psychodynamic": r"psychodynamic|psychoanaly|free association|dream interpretation",
    "supportive": r"supportive (psycho)?therapy", "IPT": r"interpersonal (psycho)?therapy|\bIPT\b",
    "motivational": r"motivational interviewing|motivational enhancement",
    "family": r"family therapy|structural family|bowen|couples therapy|marital therapy|conjoint", "group": r"group (psycho)?therapy|self-help group",
    "behavioral": r"behavioral activation|contingency management|token economy|applied behavior",
    "twelve-step": r"twelve-?step|alcoholics anonymous|narcotics anonymous", "mindfulness": r"mindfulness|acceptance and commitment therapy",
}

NEURO = {
    "dopamine": r"dopamin", "serotonin": r"serotoner|serotonin|5-?HT", "GABA": r"\bGABA\b",
    "glutamate": r"glutamate|\bNMDA\b", "acetylcholine": r"acetylcholin|cholinergic|muscarinic|nicotinic",
    "norepinephrine": r"noradrener|norepinephrine|adrenergic", "histamine": r"histaminer|histamine",
    "amygdala": r"amygdala", "hippocampus": r"hippocamp", "thalamus": r"thalam",
    "hypothalamus": r"hypothalam", "basal-ganglia": r"basal ganglia|striatum|caudate|putamen|globus pallidus",
    "substantia-nigra": r"substantia nigra", "locus-coeruleus": r"locus coeruleus", "raphe": r"raphe",
    "cerebellum": r"cerebell", "prefrontal-cortex": r"prefrontal|frontal lobe", "temporal-lobe": r"temporal lobe",
    "parietal-lobe": r"parietal lobe", "occipital-lobe": r"occipital", "brainstem": r"brainstem|pons|medulla|midbrain",
    "limbic": r"limbic", "nucleus-accumbens": r"nucleus accumbens", "receptor": r"\breceptor",
    "neurotransmission": r"reuptake|synap|second messenger|ion channel|action potential",
    "HPA-axis": r"\bHPA\b|cortisol|dexamethasone|hypothalamic-pituitary",
}

HISTORICAL = {
    "Freud": r"\bfreud", "Jung": r"\bjung", "Erikson": r"erikson", "Piaget": r"piaget",
    "Mahler": r"\bmahler", "Bowlby": r"bowlby", "Ainsworth": r"ainsworth", "Klein": r"melanie klein|kleinian",
    "Winnicott": r"winnicott", "Kohut": r"\bkohut", "Kernberg": r"kernberg", "Beck": r"aaron beck|\bbeck'?s\b",
    "Ellis": r"albert ellis", "Skinner": r"\bskinner", "Pavlov": r"pavlov", "Bandura": r"bandura",
    "Kraepelin": r"kraepelin", "Bleuler": r"bleuler", "Linehan": r"linehan", "Bowen": r"\bbowen",
    "Maslow": r"maslow", "Sullivan": r"harry stack sullivan", "Vygotsky": r"vygotsky", "Kubler-Ross": r"k(ü|u)bler-?ross",
}

SETTING = {  # single, first match wins (ordered)
    "emergency": r"emergency (department|room)|\bED\b\s|brought to the emergency",
    "inpatient": r"\binpatient|hospitaliz|admitted to|psychiatric (unit|ward)|residential",
    "consult": r"consultation-?liaison|consult(ed|ation)|primary care (physician|setting)|medical (floor|ward|service)|\bICU\b",
    "correctional": r"correctional|prison|\bjail\b|incarcerat|forensic (unit|hospital)",
    "school": r"\bschool\b|classroom|special education",
    "outpatient": r"outpatient|\bclinic\b|office|follow-?up (appointment|visit)",
}

# ---------------------------------------------------------------------------
# PRITE major category: scored keywords (entities contribute too).
# ---------------------------------------------------------------------------
PRITE = [
    ("research_stats", "Research & Statistics", [
        (3, r"\b(p[- ]?value|confidence interval|odds ratio|relative risk|hazard ratio|number needed to treat|sensitivity|specificity|positive predictive|negative predictive|effect size|regression|correlation coefficient|statistical(ly)? signif|null hypothesis|type [i12] error|standard deviation|meta-?analysis|randomized controlled|double-?blind|cohort study|case-?control|cross-?sectional|\bbias\b|confound|variance|number needed)\b"),
        (1, r"\b(study design|sample size|methodolog)\b")]),
    ("practice_issues", "Ethics, Forensics & Practice", [
        (3, r"\b(informed consent|confidential|tarasoff|duty to warn|malpractice|standard of care|competen|capacity to (consent|make)|guardian|involuntary|civil commitment|insanity defense|competency to stand trial|expert witness|subpoena|privilege|\bHIPAA\b|beneficence|nonmaleficence|boundary violation|professionalism|quality improvement|patient safety|root cause|sentinel event|medical error|history of psychiatry|impaired physician|medical board|legally protect|documentation|forensic|fee (arrangement|splitting)|expert testimony|mandated report)\b")]),
    ("admin_systems", "Administration & Systems", [
        (3, r"\b(accountable care|health (care )?system|reimbursement|medicare|medicaid|managed care|capitation|utilization review|credential|accreditation|value-based)\b")]),
    ("epidemiology", "Epidemiology", [
        (3, r"\b(prevalence|incidence|lifetime risk|risk factor|protective factor|resilience|epidemiolog|burden of disease|most common (cause|disorder)|heritabilit|intimate partner violence|domestic violence|demographic|socioeconomic|rate of suicide|suicide rate|racial or ethnic|\brace\b|ethnicit)\b")]),
    ("development", "Development & Lifespan", [
        (3, r"\b(erikson|piaget|mahler|bowlby|ainsworth|kohlberg|vygotsky|attachment|object constancy|separation-individuation|stranger anxiety|temperament|developmental (stage|milestone|task)|cisgender|puberty|object permanence|stages of (development|grief)|life transition|midlife|egocentrism|conservation|sensorimotor|preoperational|latency|school-age|preschool|moral development|nanny|caregiver|language (skill|development|acquisition)|symbolic play|by age \d|toddler|parenting|authoritative|authoritarian|permissive|neglectful)\b"),
        (1, r"\b(month-old|developmental)\b")]),
    ("behavioral_sci", "Behavioral & Social Sciences", [
        (3, r"\b(classical conditioning|operant conditioning|reinforcement|punishment|extinction|pavlov|skinner|learned helplessness|cognitive dissonance|defense mechanism|ego defense|defensive style|transference|countertransference|unconscious|libido|object relations|self psychology|attribution|conformity|obedience|milgram|\b(projection|denial|splitting|sublimation|reaction formation|rationalization|intellectualization|repression|undoing|idealization|devaluation|acting out)\b)\b")]),
    ("neurology", "Clinical Neurology", [
        (3, r"\b(stroke|seizure|epilep|parkinson|huntington|multiple sclerosis|myasthenia|guillain|neuropathy|myopathy|\bALS\b|amyotrophic|cerebral infarct|subdural|migraine|\btremor|dystonia|chorea|ataxia|aphasia|apraxia|agnosia|cranial nerve|wilson disease|charcot|babinski|nystagmus|normal pressure hydrocephalus|temporal arteritis|metastas|paraneoplastic|vitamin b12|b12 deficiency|encephalitis|meningitis|traumatic brain)\b")]),
    ("neuro_sci", "Clinical Neurosciences", [
        (3, r"\b(gene\b|genes\b|allele|chromosom|genom|mutation|methylation|epigenet|polymorphism|penetrance|knockout|twin study|microrna|transcription factor|heritability)\b"),
        (2, r"\b(neural tube|ectoderm|neural crest|neurulation|fmri|functional magnetic|myelinat|neurogenesis|long-term potentiation|synaptic plasticity|menopause|perimenopause|estrogen|androgen|testosterone|oxytocin|prolactin|neuroendocrine)\b")]),
    ("diagnostics", "Diagnostic Procedures", [
        (3, r"\b(mental status exam|rating scale|\bMRI\b|\bCT\b|\bEEG\b|\bEMG\b|polysomnograph|sleep study|sleep (stage|architecture)|non-?REM|REM sleep|neuroimaging|neuropsychological test|wechsler|\bWAIS\b|\bMMPI\b|rorschach|dexamethasone suppression|drug screen|serial sevens|proverb|interpret the (phrase|saying)|abstraction|expressive language|receptive language|dysprosod|naming|registration|orientation|concentration|mini-?mental|\bMoCA\b|\bMMSE\b)\b")]),
    ("somatic_tx", "Somatic Tx & Psychopharmacology", [
        (3, r"\b(pharmacokinetic|pharmacodynamic|half-life|cytochrome|\bCYP\b|tardive dyskinesia|neuroleptic malignant|serotonin syndrome|extrapyramidal|akathisia|titrat|augmentation|first-line (treatment|agent)|adverse effect|side effect|black box|teratogen)\b")]),
    ("psychotherapy", "Psychotherapy & Psychosocial", [
        (3, r"\b(psychotherapy|psychoeducation|therapeutic alliance|working through|milieu|relapse prevention|harm reduction|rehabilitation)\b")]),
    ("psychopathology", "Psychopathology & Disorders", [
        (1, r"\b(diagnos|disorder|symptom|criteria|presents with|differential)\b")]),
    ("consultation", "Consultation & Collaborative Care", [
        (3, r"\b(consultation-?liaison|collaborative care|integrated care)\b")]),
]
def _fix(rx):
    # drop the trailing \b so prefix-stems (competen→competency) still match
    return rx[:-2] if rx.endswith(r")\b") else rx
PRITE_COMPILED = [(c, l, [(w, re.compile(_fix(rx), re.I)) for w, rx in kw]) for c, l, kw in PRITE]
PRITE_LABEL = {c: l for c, l, _ in PRITE}
PRITE_LABEL["uncategorized"] = "Uncategorized"


def extract(text, table, multi=True):
    found = []
    for tag, rx in table.items():
        if re.search(rx, text, re.I):
            found.append(tag)
            if not multi:
                return tag
    return found if multi else (found[0] if found else None)


def prite_category(text):
    """Classify from the STEM (+answer) only — not the answer options, which
    routinely list drugs/disorders regardless of what the question is about."""
    scores = collections.Counter()
    for code, _l, kws in PRITE_COMPILED:
        for w, rx in kws:
            if rx.search(text):
                scores[code] += w
    # entities IN THE STEM nudge the category (a named drug/therapy in the stem
    # is a strong signal the question is really about treatment)
    if extract(text, MEDICATIONS): scores["somatic_tx"] += 3
    if extract(text, PSYCHOTHERAPY): scores["psychotherapy"] += 3
    if extract(text, DIAGNOSES): scores["psychopathology"] += 2
    if extract(text, NEURO): scores["neuro_sci"] += 1
    if extract(text, HISTORICAL): scores["behavioral_sci"] += 1
    if not scores:
        # clinical vignette with no other signal → most likely a disorder question
        if re.search(r"\b(year-old|the patient|a patient|presents with|reports|brought to|complains of)\b", text, re.I):
            return "psychopathology"
        return "uncategorized"
    # break ties by a sensible priority (specific topics beat catch-alls)
    top_score = max(scores.values())
    tied = [c for c, s in scores.items() if s == top_score]
    if len(tied) == 1:
        return tied[0]
    priority = ["somatic_tx", "psychotherapy", "psychopathology", "neuro_sci", "neurology",
                "diagnostics", "development", "behavioral_sci", "epidemiology",
                "research_stats", "practice_issues", "consultation", "admin_systems"]
    for c in priority:
        if c in tied:
            return c
    return tied[0]


def main():
    path = sys.argv[1]
    qs = json.load(open(path))
    dist = collections.Counter()
    tag_counts = collections.Counter()
    for q in qs:
        full = " ".join([q.get("stem", "")] + [o.get("text", "") for o in q.get("options", [])] + [q.get("answer_text", "")])
        stem = q.get("stem", "") + " " + q.get("answer_text", "")
        tags = {  # rich tags come from the FULL text (stem + options + answer)
            "diagnosis": extract(full, DIAGNOSES),
            "medication": extract(full, MEDICATIONS),
            "psychotherapy": extract(full, PSYCHOTHERAPY),
            "neuro": extract(full, NEURO),
            "historical": extract(full, HISTORICAL),
            "setting": extract(full, SETTING, multi=False),
        }
        cat = prite_category(stem)  # category from the stem only (accurate)
        if cat == "uncategorized":   # ...fall back to full text only when needed
            cat = prite_category(full)
        q["prite_category"] = cat
        q["prite_label"] = PRITE_LABEL[cat]
        q["tags"] = tags
        dist[cat] += 1
        for dim, v in tags.items():
            if v:
                tag_counts[dim] += 1
    json.dump(qs, open(path, "w"), indent=2, ensure_ascii=False)

    print(f"Tagged {len(qs)} questions.\n\nPRITE category distribution:")
    for code, n in dist.most_common():
        print(f"  {n:>4}  {PRITE_LABEL[code]}")
    print(f"\nUncategorized: {dist['uncategorized']} ({dist['uncategorized']/len(qs)*100:.1f}%)")
    print("\nQuestions with at least one tag, by dimension:")
    for dim, n in tag_counts.most_common():
        print(f"  {n:>4}  {dim}")


if __name__ == "__main__":
    main()
