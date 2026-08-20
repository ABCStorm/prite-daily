#!/usr/bin/env python3
"""Write open-ended prompt + teaching-point JSONL for CPRITE 2024 audio drills."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "public" / "data" / "cprite_questions.json"
OUT_TEACH = ROOT / "extraction" / "output" / "cprite_audio_scripts.jsonl"
OUT_PROMPT = ROOT / "extraction" / "output" / "cprite_audio_prompts.jsonl"

PROMPTS: dict[int, str] = {
    1: "What is a common administrative barrier to receiving preventive mental health care?",
    2: "Before prescribing a controlled substance by telemedicine, what does the Ryan Haight Act require?",
    3: "A lonely teenager thinks 'I'm so awkward' at a party. Identifying that automatic thought and examining evidence for and against it is which psychotherapy?",
    4: "Which language milestone is typical of preschoolers around ages three to five?",
    5: "A teenager in therapy for school refusal after parental divorce. Naming staying home as a way of showing unspoken anger is which intervention?",
    6: "Early maltreatment-related NR3C1 promoter hypermethylation is classically studied in which brain structure?",
    7: "Compared with adult OCD, what is a characteristic feature of pediatric obsessive-compulsive disorder?",
    8: "In middle childhood, what mechanism increases the risk that a minority child will internalize a stereotypical view of incompetence?",
    9: "When is group therapy the clearest first-line psychotherapy for a child?",
    10: "A minor withdraws assent to therapy while parents still consent. Which ethical tension is this?",
    11: "When should adoptive parents begin talking with a child about the adoption?",
    12: "Joint attention and social referencing at about fifteen months are developmental roots of which later capacity?",
    13: "Hot, impulsive, rage-driven aggression after a trivial frustration is classified as what type of aggression?",
    14: "After a pet's death, a seven-year-old has nighttime monster fears and needs to sleep with parents. What is the most likely diagnosis?",
    15: "In a child with ADHD and loud snoring, which comorbidity is most characteristic of obstructive sleep apnea?",
    16: "Adult-arranged play that lets a child do with help what they cannot yet do alone illustrates which concept?",
    17: "After high-dose benzodiazepines fail for catatonia in an autistic youth, what is the next treatment?",
    18: "Which mood stabilizer is FDA-approved for acute mania and maintenance in youth age twelve and older?",
    19: "What is the most common psychiatric comorbidity of oppositional defiant disorder?",
    20: "For a child with twice-monthly migraines plus photophobia and vomiting, what is a first-line preventive medication?",
    21: "Substituting sounds, such as saying bofroom for bathroom, is which type of communication disorder?",
    22: "A program delivered to all students regardless of risk is which level of prevention?",
    23: "Which prevention intervention has the strongest evidence for child mental health?",
    24: "The cerebral cortex develops from which embryonic brain vesicle?",
    25: "A trial that tests treatment in real-world usual-care conditions is studying what?",
    26: "A preschooler with progressive proximal weakness and a myopathic EMG most likely has which disease?",
    27: "Which finding more specifically marks early-onset schizophrenia than hallucinations or withdrawal?",
    28: "In PCIT, repeating the child's meaning back, such as 'You think the ice cream is yummy,' is which PRIDE skill?",
    29: "Personality change, tremor, and a relative who needed a liver transplant suggest which disease?",
    30: "When parents disagree with a diagnosis, what should the clinician do with the record?",
    31: "Testing every EEG time point inflates which statistical error, and what is the direct fix?",
    32: "Eyes-closed stance with a light push is designed to assess which function?",
    33: "Which imaging modality measures amygdalar activity rather than structure?",
    34: "Genotyping thousands of SNPs in cases versus controls to find frequency differences is which study design?",
    35: "Pedigree-based analyses are used to map loci that contribute to what kind of familial traits?",
    36: "Explaining fight-or-flight as a useful survival system is which model of anxiety?",
    37: "For time-out to work, what is an essential rule about target behaviors and the setting?",
    38: "Watching oneself from above with time distortion during a trauma is which dissociative experience?",
    39: "Intellectual disability, infantile spasms, and a thickened lumbosacral plaque suggest which neurocutaneous syndrome?",
    40: "What should a clinician say about sexual-orientation-change or conversion efforts?",
    41: "Acute psychosis plus a malar rash. What is the initial treatment of significant neuropsychiatric lupus?",
    42: "Proactive, planned, goal-directed aggression is the signature of which disorder?",
    43: "Warmth plus an invitation to reason about a rule is which parenting style?",
    44: "Which electrolyte shift is the lethal classic of refeeding syndrome?",
    45: "Aripiprazole akathisia treated with a medication that then causes wheezing. Which drug was given?",
    46: "A year of bedtime stalling, delayed sleep onset, and night wakings confined to sleep, without medical competitors, is which diagnosis?",
    47: "The state taking custody because an infant cannot be safely left with a using parent is which legal doctrine?",
    48: "External validity is generalizability. Time-related change in subjects threatens which kind of validity?",
    49: "In a first session for adolescent alcohol use, what is the best initial therapeutic stance?",
    50: "Among social-anxiety cognitions, which one most specifically flags suicide risk?",
    51: "Relaxation plus graded exposure to a feared food is which learning procedure?",
    52: "A child's fear that session content will be revealed in custody court is about which legal concept?",
    53: "How should a dying adolescent's withdrawal and anger best be met?",
    54: "A three-year-old's later verbal memory of an event tracks which ability at the time of encoding?",
    55: "The AIMS exam includes observation of which structure for tardive dyskinesia?",
    56: "How should a therapist support healthy ethnic identity in a multiethnic teen?",
    57: "An institution bars lobbying. Which response to a lawmaker's question is still allowed?",
    58: "McKeiver versus Pennsylvania held that juveniles do not have which trial right?",
    59: "Making the therapist play the child while the child plays the adult uses which mechanism?",
    60: "When is buprenorphine started in an adolescent with opioid use disorder?",
    61: "GRM3 or mGluR3 variants are among the more consistent GWAS signals for which class of illness?",
    62: "Side-by-side play with little interaction is which type of preschool play?",
    63: "Earlier motor milestones in many traditional African caregiving systems mainly reflect what?",
    64: "In the Grant study of adult development, which childhood factor best predicted later adaptation?",
    65: "Two weeks after a fire, irritability, restlessness, and trauma-related amnesia with preserved attention is which diagnosis?",
    66: "After CPS removal, what is the most common permanency outcome?",
    67: "A hard return to school after a year of virtual class hits which Erikson stage in grade-schoolers?",
    68: "Insomnia, headache, depressed mood, and restlessness a week after stopping daily cannabis is which syndrome?",
    69: "What is the most common psychiatric comorbidity of pediatric epilepsy?",
    70: "Restrictive parenting can be protective in which environmental context?",
    71: "CT is preferred over MRI for evaluation of which finding?",
    72: "For young children with ODD, which therapy has the best evidence?",
    73: "Stopping aversive questioning when a teen meets curfew is which operant process?",
    74: "High-quality evidence for antipsychotic weight gain in youth supports switching to which agent?",
    75: "If comorbid ADHD changed risperidone's effectiveness, ADHD was acting as what in the analysis?",
    76: "Habit reversal training starts with which step?",
    77: "Which test detects large deletions and duplications, or copy-number variants?",
    78: "Severe preschool ADHD that failed behavioral containment still starts with which medication?",
    79: "In bell-and-pad conditioning, what becomes the conditioned stimulus that elicits waking?",
    80: "When a clinician receives a subpoena for a child's chart, what is the correct first response?",
    81: "A maltreated mother reading an infant's cry as 'you don't feel loved' is which process?",
    82: "A reading-disabled child who did well with an early IEP then sinks in fifth grade most often has which emerging disability?",
    83: "Irritability, hypersomnolence, inattention, and loud snoring. What is the gold-standard next test?",
    84: "If a repetitive movement soothes the child, is it more likely a stereotypy or a tic?",
    85: "Which trauma carries the highest pediatric PTSD risk?",
    86: "Which preschool sexual behavior is outside typical curiosity and should be assessed?",
    87: "Infant hypotonia, constipation, poor feeding, and dilated pupils after a new food. Which study supports botulism?",
    88: "Serving as both treating psychiatrist and school consultant most threatens which ethical principle?",
    89: "Restriction without weight or shape fear, binge loss of control, or purging is which feeding diagnosis?",
    90: "If treatment risk is three percent and control risk is two percent, what is the number needed to harm?",
    91: "A child's capacity for end-of-life decisions is judged by what, rather than chronological age?",
    92: "Fever, headache, stiff neck, and lymphocytic aseptic meningitis on a mood stabilizer points to which drug?",
    93: "What is a clinic-level barrier to measurement-based care?",
    94: "EEG alpha, the posterior dominant rhythm, is paced by which structure?",
    95: "Hospital day three of meningitis, fluctuating irritability and eye contact with an unchanged neuro exam is which diagnosis?",
    96: "What is the strongest risk factor for enuresis?",
    97: "Spasticity is a sign of which motor-neuron class?",
    98: "In supportive therapy, what should be done with a warm positive transference?",
    99: "Irritability after parental divorce without vegetative symptoms is which diagnosis rather than major depression?",
    100: "What is the school psychologist's distinctive job?",
    101: "Compared with using separate experimental groups, what is a benefit of a crossover study design?",
    102: "A teen is anxious about tomorrow's race and has forgotten to invite her mother. Letting her talk about the meet rather than the snub is which psychotherapy?",
    103: "What is the most widely replicated early MRI finding in autism spectrum disorder?",
    104: "Orexin neurons from the lateral hypothalamus to locus coeruleus, raphe, and laterodorsal tegmentum mainly support which function?",
    105: "Toddlers meet language milestones earlier if parents use a greater proportion of what kind of talk?",
    106: "For a ten-year-old with ADHD, ODD, and explosive tantrums, what is first-line medication?",
    107: "A depressed teen says they feel great just smoking weed. Using motivational interviewing, what is the best next phrase?",
    108: "Psychogenic stress amenorrhea acts through impairment of which hormone's release?",
    109: "A teen sleeps from six in the morning to three in the afternoon all summer. What is the best initial way to reset the clock before school?",
    110: "Deficits in which early neurocognitive factor are most associated with later aggression?",
    111: "In a randomized trial, which statistic describes effect size rather than mere significance?",
    112: "A teen picks and plucks at an unremarkable face because it looks deformed. What is the most likely DSM diagnosis?",
    113: "A fellow is invited to the capitol to promote awareness of children's mental-health needs, not a specific bill. Why is that appropriate?",
    114: "Fifty percent of untreated high-risk children develop depression versus twenty-five percent on drug. What is the number needed to treat?",
    115: "Childhood trauma plus the FKBP5 A/T risk allele causes glucocorticoid resistance by interrupting what?",
    116: "After terminal news, a clear-minded twelfth-grader wants a family trip to celebrate graduation. What best explains the request?",
    117: "Which characteristic is the strongest predictor of suicide and suicide attempts?",
    118: "Waxy flexibility and mutism in anti-NMDA encephalitis. Besides treating the encephalitis, which medication first for the motoric symptoms?",
    119: "Fatigable afternoon diplopia and droopy lids. Abnormality of which gland is commonly associated?",
    120: "A bilingual three-and-a-half-year-old has about ten words in each language and few two-word phrases. What should the psychiatrist do next?",
    121: "Routine PHQ-9s before depression visits are most associated with which outcome?",
    122: "Why can SSRIs for PMDD be dosed only in the luteal phase?",
    123: "What is the gold-standard observational test for diagnosing autism spectrum disorder?",
    124: "Drinking to relieve emotional distress is the best example of which learning process?",
    125: "What is the most common site for skin picking in excoriation disorder?",
    126: "New mood change, limb paresthesia, and blurred vision. Which MRI sequence is most useful?",
    127: "Which grief response is developmentally appropriate in an adolescent?",
    128: "A three-year-old needs a strict bedtime routine and fears the dark but is flexible elsewhere. What is the most likely explanation?",
    129: "Among listed psychotherapies, which has the most AACAP-cited evidence for youth major depression?",
    130: "Young adults homozygous for the serotonin-transporter short allele had higher depression risk in the presence of what?",
    131: "Polysomnography is required to diagnose which of these sleep disorders?",
    132: "Why is clomipramine superior to other tricyclics for OCD?",
    133: "A child with congenital HIV, cognitive decline, seizures, and EBV in the CSF. What is the most common cause?",
    134: "A fifteen-year-old on methylphenidate tracks below the fifth percentile, is Tanner two, and has delayed bone age with normal growth hormone. What explains the short stature?",
    135: "Infants distinguish all speech sounds at three months but only native sounds by twelve months. Which process explains the change?",
    136: "Relapse prevention is which form of prevention?",
    137: "Which criterion must be present to diagnose gender dysphoria in a child?",
    138: "Anthropology's focus on policies that shape resources and constraints is which perspective?",
    139: "Which content is generally acceptable to text outside the medical record?",
    140: "Replacing expulsion for substance use with a credited support group so the student stays in school is which approach?",
    141: "Watching a finger move toward the patient's nose tests which function?",
    142: "Which action would make a clinician vulnerable to a negligent tort rather than an intentional tort?",
    143: "Placing a vibrating tuning fork midline on the forehead tests which cranial nerve?",
    144: "Malpractice requires duty, negligence, harm, and which fourth element?",
    145: "Which environmental factor most robustly predicts externalizing problems in young children?",
    146: "A twelve-month-old looks at mother, gets a nod, then touches the sand. What is this called?",
    147: "Saying 'Some kids with depression think about suicide. Has that happened for you?' is which interview technique?",
    148: "A medication in pregnancy is four times more likely to be associated with a birth defect. Which statistic is that?",
    149: "ADHD plus optic glioma, axillary freckling, and café-au-lait macules. What is the comorbid diagnosis?",
    150: "Reluctance to diagnose borderline personality disorder in youth is most likely based on what?",
    151: "Two separate cell types in the same person is known as what?",
    152: "Childhood absence with three-hertz spike-and-wave most often follows which inheritance pattern?",
    153: "What is a common barrier to implementing telepsychiatry?",
    154: "A medically stable overdose is boarding on pediatrics awaiting a psychiatry bed. What should consultation-liaison focus on first?",
    155: "Puberty restarts through pulsatile release of which hormone?",
    156: "Which method best splits genetic from environmental contributions to disease?",
    157: "Using a mental picture of a past event to understand a new one first develops in which stage?",
    158: "Parents say psychosis is 'the evil eye.' That comment illustrates what?",
    159: "According to Piaget, reversibility is the hallmark of which stage?",
    160: "Why should the treating psychiatrist of a justice-involved youth not also be the forensic evaluator?",
    161: "New head-banging in a nonverbal child with intellectual disability. What is the most appropriate next step?",
    162: "What is a priority of community-based systems of mental health care?",
    163: "What standard of proof is required to report suspected child abuse?",
    164: "A psychiatrist is late, apologizes, and names how that might have felt, matching a skill the child is practicing. Which technique is this?",
    165: "A case-control study of recalled maternal caffeine use and later ADHD is vulnerable to which bias?",
    166: "To adopt trauma-informed care, what should an organization do first?",
    167: "In adolescent depression, what finding is most likely on polysomnography?",
    168: "Which factor is most closely associated with lasting psychological sequelae after pediatric traumatic brain injury?",
    169: "Lipophilic hormones influence brain development by binding where?",
    170: "Which type of epilepsy is most likely to require lifelong treatment?",
    171: "When has a psychiatrist established a doctor-patient relationship with the parent of a child patient?",
    172: "Which features are more common in adolescent than child major depression?",
    173: "Asking 'Which movie character are you most like?' is which interview technique?",
    174: "After one child with autism, what is the best estimate of recurrence in the next child?",
    175: "Compared with an adult, which clozapine side effect is a youth more likely to experience on this exam?",
    176: "Among mood stabilizers, which agent has been used to manage clozapine-associated akathisia?",
    177: "In collaborative care, a PHQ-9 is stuck on fluoxetine twenty milligrams plus weekly CBT. What should the consultant recommend first?",
    178: "Reviewing the whole caseload to find who is not improving follows which collaborative-care principle?",
    179: "A short, obese, sleepy ten-year-old with learning problems, ordering rituals, and skin picking. Which test is most appropriate?",
    180: "That same presentation is Prader-Willi. Which inheritance pattern does this item key?",
    181: "After a suicide attempt, which transition-plan element addresses school connectedness?",
    182: "What is the best rationale for choosing fluoxetine in adolescent major depression?",
    183: "Which psychotherapy has the most evidence for youth in this situation?",
    184: "Which three symptoms commonly constitute an aura in childhood focal seizures?",
    185: "In the alternative DSM-5 model, which three are core dimensional impairments of adolescent borderline personality?",
    186: "A CYP 2 D 6 poor metabolizer. Metabolism of which three antipsychotics would be most affected?",
    187: "Which three are mechanisms of epigenetic alteration in gene expression?",
    188: "Besides safe, effective, and patient-centered, which three complete the Institute of Medicine's six aims of quality?",
    189: "Chess and Thomas defined which three infant temperament clusters?",
    190: "Which three clinical features are consistent with benign Rolandic epilepsy?",
    191: "Parent management training is operant conditioning. Which three are core features of operant conditioning?",
    192: "Which three cortical areas make up the salience network on this exam?",
    193: "Preschoolers sharing a jungle pretend most rely on which three social developments?",
    194: "HIPAA allows disclosure without extra authorization in which three treatment situations?",
    195: "Which three genetic disorders does this item key as X-linked?",
    196: "Watching others undress, stealing shoes for arousal, and cross-dressing with sexual excitement. Which three paraphilias fit?",
    197: "Two nonfunctional CYP 2 C 19 alleles. Which three antidepressants need a lower dosing strategy?",
    198: "Which three are the most common psychiatric comorbidities of Tourette disorder?",
    199: "Migraine patients have an increased incidence of which three psychiatric symptoms?",
    200: "A low-BMI wrestler faints after cutting weight. Which three tests belong in the initial evaluation?",
}

TEACHING: dict[int, str] = {
    15: "In a snoring child with ADHD, ask about bedwetting; obstructive sleep apnea is linked to nocturnal enuresis.",
    19: "Oppositional defiant disorder is most often comorbid with ADHD, so look for ADHD first.",
    41: "New psychosis plus a malar rash is neuropsychiatric lupus and starts with corticosteroids.",
    67: "Grade-school depression after disrupted school hits industry versus inferiority; assess competency.",
    69: "ADHD is the most common psychiatric comorbidity of pediatric epilepsy, so screen for it.",
    73: "Taking away nagging when a teen is on time is negative reinforcement; it increases the desired behavior.",
    82: "A late-elementary crash after an early reading IEP often means an emerging written-expression disability.",
    83: "Snoring plus school problems should prompt overnight polysomnography for obstructive sleep apnea.",
    87: "A floppy infant after a new food needs EMG to support infant botulism.",
    92: "Aseptic meningitis on a mood stabilizer points to lamotrigine.",
    99: "Without vegetative symptoms, irritability after a stressor is adjustment disorder, not major depression.",
    114: "Number needed to treat is one divided by the absolute risk reduction; here that is four.",
    119: "Fatigable ptosis and double vision are myasthenia; think thymic hyperplasia or thymoma.",
    133: "HIV, EBV in spinal fluid, and new neuro decline mean primary central nervous system lymphoma.",
    141: "A finger moving toward the nose tests the accommodation reflex.",
    149: "Optic glioma, café-au-lait spots, and axillary freckling are neurofibromatosis type one.",
    151: "Two cell lines in one person is mosaicism.",
    161: "New self-injury in a nonverbal child is pain until proven otherwise; start with a dental exam.",
    165: "Asking mothers of cases what they used in pregnancy is classic recall bias.",
    179: "Prader-Willi with hypersomnolence needs a sleep study for obstructive apnea.",
    180: "Prader-Willi is keyed here as maternal uniparental disomy of chromosome fifteen.",
    181: "School connectedness is a named adult who checks in with the youth every day.",
    185: "The alternative model keys identity impairment, social dysfunction, and affective dysregulation.",
    187: "Epigenetics is DNA methylation, histone modification, and regulation by noncoding RNA.",
    189: "Chess and Thomas clustered infants as easy, difficult, and slow to warm up.",
    191: "Operant parent training is antecedent, identified behavior, and consequence.",
    192: "This exam keys the salience network as insula, anterior cingulate, and ventromedial prefrontal cortex.",
    197: "A CYP 2 C 19 poor metabolizer needs lower doses of citalopram, escitalopram, and sertraline.",
    199: "Migraine is associated with depression, panic attacks, and mania-spectrum symptoms.",
    200: "A restricting adolescent who fainted needs a complete blood count, a metabolic panel, and an electrocardiogram first.",
}

EXPAND = [
    (r"\bNNT\b", "number needed to treat"),
    (r"\bARR\b", "absolute risk reduction"),
    (r"\bNNH\b", "number needed to harm"),
    (r"\bPSG\b", "polysomnography"),
    (r"\bEMG\b", "electromyography"),
    (r"\bADOS\b", "the autism diagnostic observation schedule"),
    (r"\bPMDD\b", "premenstrual dysphoric disorder"),
    (r"\bGnRH\b", "gonadotropin-releasing hormone"),
    (r"\bIEP\b", "individualized education program"),
    (r"\bCSF\b", "cerebrospinal fluid"),
    (r"\bEBV\b", "Epstein-Barr virus"),
    (r"\bPHQ-9\b", "P H Q 9"),
    (r"\bCBT\b", "cognitive behavioral therapy"),
    (r"\bIPT\b", "interpersonal therapy"),
    (r"\bODD\b", "oppositional defiant disorder"),
    (r"\bADHD\b", "A D H D"),
    (r"\bPTSD\b", "P T S D"),
    (r"\bOCD\b", "obsessive-compulsive disorder"),
    (r"\bBDD\b", "body dysmorphic disorder"),
    (r"\bFDA\b", "F D A"),
    (r"\bMRI\b", "M R I"),
    (r"\bCT\b", "C T"),
    (r"\bEEG\b", "E E G"),
    (r"\bANC\b", "absolute neutrophil count"),
]


def speech(text: str) -> str:
    t = text.replace("→", " points to ").replace("=", " is ")
    t = t.replace(" / ", ", ").replace("–", " to ").replace("—", ", ")
    t = t.replace("%", " percent").replace("½", " and a half")
    t = t.replace("5-HTTLPR", "serotonin transporter short allele")
    t = t.replace("CYP2D6", "CYP 2 D 6").replace("CYP2C19", "CYP 2 C 19")
    t = t.replace("2D6", "2 D 6").replace("2C19", "2 C 19")
    t = t.replace("NR3C1", "N R 3 C 1").replace("FKBP5", "F K B P 5")
    t = t.replace("GRM3", "G R M 3").replace("mGluR3", "metabotropic glutamate receptor 3")
    t = t.replace("AMPD", "alternative DSM-5 model")
    t = t.replace("HIPAA", "HIPAA").replace("TPO", "treatment, payment, and operations")
    for pat, rep in EXPAND:
        t = re.sub(pat, rep, t)
    t = re.sub(r"\s+", " ", t).strip()
    if t and t[-1] not in ".!?":
        t += "."
    return t


def teaching_for(q: dict) -> str:
    n = q["q_index"]
    if n in TEACHING:
        return speech(TEACHING[n])
    m = re.search(r"Bottom line:\s*(.*)$", q["clinical_application"], re.I)
    raw = m.group(1).strip() if m else q["explanation_text"].split(".")[0] + "."
    return speech(raw)


def qid(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def wc(s: str) -> int:
    return len(s.split())


def main() -> None:
    bank = json.loads(BANK.read_text())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    missing = [q["q_index"] for q in bank if q["q_index"] not in PROMPTS]
    if missing:
        raise SystemExit(f"Missing prompts for {missing}")
    teach_rows = []
    prompt_rows = []
    problems = []
    for q in bank:
        n = q["q_index"]
        teach = teaching_for(q)
        prompt = speech(PROMPTS[n])
        if not prompt.endswith("?"):
            prompt = prompt.rstrip(".!") + "?"
        if wc(teach) > 45:
            problems.append(f"Q{n} teaching {wc(teach)} words: {teach}")
        if wc(prompt) > 65:
            problems.append(f"Q{n} prompt {wc(prompt)} words: {prompt}")
        if not re.search(r"[.!?]$", teach):
            problems.append(f"Q{n} teaching punctuation: {teach}")
        if re.search(r"which of the following|option [a-e]|choices?:", prompt, re.I):
            problems.append(f"Q{n} prompt still MC: {prompt}")
        teach_rows.append({"question_id": qid(q), "script": teach, "generated_at": now, "engine": "grok"})
        prompt_rows.append({"question_id": qid(q), "prompt": prompt, "generated_at": now, "engine": "grok", "kind": "prompt"})
    if problems:
        raise SystemExit("\n".join(problems[:20]) + f"\n({len(problems)} problems)")
    OUT_TEACH.parent.mkdir(parents=True, exist_ok=True)
    OUT_TEACH.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in teach_rows))
    OUT_PROMPT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in prompt_rows))
    print(f"Wrote {len(teach_rows)} teaching → {OUT_TEACH}")
    print(f"Wrote {len(prompt_rows)} prompts → {OUT_PROMPT}")
    print("sample teach", teach_rows[0]["script"])
    print("sample prompt", prompt_rows[0]["prompt"])
    print("Q184 prompt", next(r["prompt"] for r in prompt_rows if r["question_id"].endswith("-184")))
    print("Q200 teach", next(r["script"] for r in teach_rows if r["question_id"].endswith("-200")))


if __name__ == "__main__":
    main()
