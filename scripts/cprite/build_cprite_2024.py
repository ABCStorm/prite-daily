#!/usr/bin/env python3
"""Build the CPRITE 2024 practice bank.

Q1–100: ~/Downloads/CPRITE 2024 Q1-100.docx (pandoc → /tmp/cprite-2024-q1-100.md).
Q101–200: ~/Downloads/CPRITE 2024 Q101-200.docx (Word XML; green-shaded keys).
Output: public/data/cprite_questions.json

IDs use year "CPRITE 2024" so they never collide with PRITE 2024-N.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clinical_2024 import CLINICAL
from clinical_2024_101_200 import CLINICAL as CLINICAL_101
from meta_2024_101_200 import META as META_101

ROOT = Path(__file__).resolve().parents[2]
SRC_MD = Path("/tmp/cprite-2024-q1-100.md")
SRC_DOCX_101 = Path.home() / "Downloads" / "CPRITE 2024 Q101-200.docx"
OUT = ROOT / "public" / "data" / "cprite_questions.json"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
CORRECT_FILL = "C6EFCE"
Q134_FIG = "images/cprite/2024_q134_growth.png"

# (topic, explanation) keyed by original item number.
# Explanations follow the keyed answer in the source quiz.
META: dict[int, tuple[str, str]] = {
    1: ("Systems & Prevention",
        "Preventive mental health visits are often carved out as 'not medically necessary,' so families cannot get them reimbursed even when therapy and med management themselves are covered. (A) is false: psychotherapy is commonly a covered benefit. (B) and (D) invert usual medical-necessity and E&M rules. (E) is not a standard payer policy. Teaching point: The usual administrative barrier to prevention is medical-necessity denial, not a blanket ban on therapy or physician billing."),
    2: ("Ethics & Forensics",
        "The Ryan Haight Act requires at least one in-person medical evaluation before a clinician may prescribe a controlled substance via telemedicine (with narrow public-health emergencies and DEA special registrations as exceptions). State licensure, malpractice coverage, and PDMP checks matter, but they are not what the Act itself mandates. Teaching point: Ryan Haight = one in-person exam before tele-prescribing a controlled substance."),
    3: ("Psychotherapy",
        "Identifying the automatic thought ('I'm so awkward') and examining evidence for and against it is classic CBT cognitive restructuring. Supportive work would soothe without testing the thought. IPT would target the interpersonal role (loneliness/isolation) rather than the cognition. DBT would add mindfulness, distress tolerance, and validation. Psychodynamic work would explore unconscious meaning or transference. Teaching point: Thought → evidence testing = CBT."),
    4: ("Development",
        "Preschoolers (roughly 3–5 years) add question words ('why,' 'how') and rapidly expand sentences. Two-word combinations and word+gesture are toddler (18–24 month) milestones. Passive-voice comprehension and morphological bootstrapping of novel words are later, school-age skills. Teaching point: 'Why/how' questions are the preschool language milestone the boards like."),
    5: ("Psychotherapy",
        "Defense interpretation names the unconscious maneuver (school refusal as displaced anger at the divorcing parents) and invites the patient to consider it. (A) is clarification of somatic symptoms. (B) is a transference interpretation (you/me as parent). (D) is empathic support. (E) is a confrontation that sounds blaming. Teaching point: Defense interpretation = linking the symptom to the warded-off affect."),
    6: ("Neuroscience",
        "Early maltreatment is linked to NR3C1 (glucocorticoid-receptor gene) promoter hypermethylation and altered GR expression in the hippocampus, the structure richest in GRs and most studied in HPA-axis programming. Amygdala, hypothalamus, insula, and basal ganglia are involved in stress circuits but are not the classic NR3C1 methylation locus. Teaching point: Abuse → NR3C1 hypermethylation → hippocampal glucocorticoid receptors."),
    7: ("Psychopathology",
        "Pediatric OCD is more often ego-syntonic: children have less insight that the obsessions/compulsions are excessive. It is at least as heritable as adult OCD, often has a better long-term prognosis, is more common in boys before puberty, and is not defined by a trauma precipitant (that would push toward PTSD or PANDAS-style workup, not typical OCD). Teaching point: Child OCD = less insight than adult OCD."),
    8: ("Development",
        "In middle childhood, social comparison comes online and minority children become aware of majority-culture stereotypes, raising the risk of internalized incompetence. Bicultural competence is protective. Anti-bias curricula and ethnic-constancy understanding are not the mechanism that increases risk. Teaching point: Stereotype internalization rises when children first grasp the majority view of their group."),
    9: ("Psychotherapy",
        "Group therapy's unique active ingredient is live practice of peer relationships, so social-skill / friendship deficits are the clearest indication. Severe family conflict needs family work. Severe anhedonic depression and impulsive acting-out often destabilize a group. Undisclosed abuse needs individual safety and disclosure work first. Teaching point: Group is first-line when the problem is making and keeping friends."),
    10: ("Ethics & Forensics",
        "The teen no longer assents, the parents still consent, and high-risk history is in play — AACAP's core tension here is assent and consent, not confidentiality (the content of sessions is not the issue), advocacy, third-party payers, or a statute. Teaching point: When a minor wants out and parents want in, the ethics frame is assent vs consent."),
    11: ("Development",
        "Adoption is discussed early — as soon as language allows, often toddlerhood — and revisited as cognition matures, not saved for a single 'reveal.' Waiting for formal operational thought, adolescence, or the child to ask first leaves a secrecy that undermines trust. Teaching point: Tell early, tell often; adoption is a conversation, not an event."),
    12: ("Development",
        "Joint attention (following what mother looks at) plus social referencing (using her affect to guide reaction) at ~15 months are the developmental roots of empathy — sharing another's attentional and emotional state. They are not IQ, verbal, or Oedipal markers, and they argue against an inhibited style. Teaching point: Joint attention + social referencing → later empathy."),
    13: ("Psychopathology",
        "This is hot, impulsive, rage-driven aggression after a trivial frustration — affective (reactive) aggression. Instrumental/appetitive aggression is planned to obtain a goal. Peer-facilitated needs an audience. Callous-unemotional describes a trait, not this episode's form. Teaching point: Explosive, affect-laden, poorly planned = affective aggression."),
    14: ("Psychopathology",
        "Nighttime 'monsters' plus new bed-sharing after a loss, in a 7-year-old, is developmentally typical fear organized around separation from attachment figures — separation anxiety — not panic (unexpected surges), a circumscribed phobia, free-floating GAD worry, or PTSD (the dog's death is a loss, not a qualifying trauma with re-experiencing/hyperarousal). Teaching point: New nighttime fear + need to sleep with parents after a loss = think SAD."),
    15: ("Psychopathology",
        "Inattention, hyperactivity, and loud snoring point to ADHD with likely obstructive sleep apnea. OSA's most characteristic pediatric psychiatric/medical comorbidity among these choices is nocturnal enuresis. Seizures, migraine, hearing loss, and autoimmunity are not the typical pairing. Teaching point: Snoring ADHD kid → ask about bedwetting; treat the airway."),
    16: ("Development",
        "Guided play is an adult arranging the environment so the child can do with help what they cannot yet do alone — Vygotsky's zone of proximal development. Decentration and conservation are Piagetian concrete-operational achievements. Reciprocal determinism is Bandura. Assimilation/accommodation is Piaget's adaptation, not the scaffolding idea. Teaching point: Adult-crafted, child-led play = ZPD."),
    17: ("Psychopharmacology",
        "Catatonia that fails high-dose benzodiazepines next goes to ECT, including in autistic and developmentally delayed youth. Adding a neuroleptic can worsen catatonia (or NMS). rTMS and valproate are not first-line rescue. Staying the course after a failed week is not appropriate. Teaching point: Benzo-refractory catatonia → ECT, not an antipsychotic."),
    18: ("Psychopharmacology",
        "Lithium is FDA-approved for acute mania and maintenance in youth ≥12. Divalproex, lamotrigine, oxcarbazepine, and carbamazepine are used off-label or for other indications; none share that exact pediatric bipolar approval. Teaching point: Lithium is the age-12+ FDA mood stabilizer for mania and maintenance."),
    19: ("Psychopathology",
        "Temper loss, arguing with adults, blaming, and annoying others for ≥6 months is ODD. The most common comorbidity is ADHD (well over half of clinic ODD). Tourette, SUD, SAD, and OCD co-occur less often. Teaching point: ODD → look for ADHD first."),
    20: ("Psychopharmacology",
        "Twice-monthly migraines with photophobia and vomiting warrant prevention. Propranolol is a first-line pediatric migraine preventive. Ibuprofen, sumatriptan, ergotamine, and prochlorperazine are abortive (or antiemetic) agents, not preventives. Teaching point: Pediatric migraine prevention = propranolol (or a TCA/topiramate); triptans treat the attack."),
    21: ("Development",
        "Substituting sounds ('bofroom' for 'bathroom') is a speech-sound (articulation/phonological) error. Receptive/expressive language disorders affect meaning and grammar, fluency is stuttering, and social-pragmatic disorder is use of language in context. Teaching point: Wrong sounds, intact meaning = speech-sound disorder."),
    22: ("Systems & Prevention",
        "A program delivered to all students regardless of risk is universal (primary) prevention. Selective targets a risk group; indicated/tertiary targets already-symptomatic youth; secondary is early detection. Teaching point: Whole-school, no risk screen = universal prevention."),
    23: ("Systems & Prevention",
        "The prevention intervention with the strongest child mental-health evidence is treating parental psychiatric illness. Exercise, music, mindfulness, and micronutrients have weaker or mixed preventive data. Teaching point: Treat the parent's illness to prevent the child's."),
    24: ("Neuroscience",
        "The telencephalon (prosencephalic vesicle) gives rise to the cerebral cortex, hippocampus, and basal ganglia. Diencephalon → thalamus/hypothalamus; mesencephalon → midbrain; rhombencephalon/myelencephalon → hindbrain/medulla. Teaching point: Cortex comes from telencephalon."),
    25: ("Research Methods",
        "Effectiveness trials test how a treatment works in real-world, usual-care conditions. Efficacy trials test it under ideal, tightly controlled conditions. Naturalistic, crossover, and meta-analysis are designs, not that distinction. Teaching point: Efficacy = can it work; effectiveness = does it work out there."),
    26: ("Neuroscience",
        "Progressive proximal weakness in a preschooler plus myopathic EMG (low-amplitude, short-duration MUAP) is Duchenne muscular dystrophy. MG is fatigable with decrement on repetitive stim. MS is central and rare at 5. Polio is neuropathic (large-amplitude MUAPs). LGS is an epilepsy syndrome. Teaching point: Toddler/preschool boy, stairs, myopathic EMG = DMD."),
    27: ("Psychopathology",
        "Hallucinations, irritability, language delay, and withdrawal occur in many non-psychotic childhood disorders (anxiety, trauma, ASD, depression). Formal thought disorder — loose associations — more specifically marks early-onset schizophrenia. Teaching point: Looseness of associations separates EOS from look-alike behavioral disorders."),
    28: ("Psychotherapy",
        "Repeating the child's meaning ('You think the ice cream is yummy') is PRIDE Reflection. Praise would value the act, imitation would do the same action, behavioral description would narrate the behavior, enjoyment is the 'E' affect. Teaching point: PCIT reflection = say back the child's words/meaning."),
    29: ("Neuroscience",
        "Personality change, tremor, aggression, plus a relative who needed a liver transplant is Wilson disease (ATP7B, copper, Kayser–Fleischer, low ceruloplasmin). Niemann–Pick is storage/hepatosplenomegaly; Huntington is typically adult CAG; the ataxias and idiopathic cirrhosis lack this neuropsychiatric + transplant pedigree. Teaching point: New neuropsych + liver family history = Wilson."),
    30: ("Ethics & Forensics",
        "Patients/parents may disagree with a diagnosis; the record should document that disagreement rather than erase, euphemize, or code-hide the clinical impression. Emphasizing 'I am right' is adversarial; omitting the diagnosis is inaccurate. Teaching point: Keep the diagnosis and explicitly note the family's dissent."),
    31: ("Research Methods",
        "Testing every EEG time point inflates type I error (false positives). The direct fix is a multiple-comparison correction (Bonferroni, FDR, cluster-based permutation). Hierarchical/mixed models and nonparametric tests address other problems; power speaks to type II error. Teaching point: Many tests → correct for multiple comparisons."),
    32: ("Assessment",
        "Eyes-closed stance with a light push is a proprioceptive / joint-position-sense (Romberg-like) challenge. It is not a test of praxis, executive function, isolated core strength, or simple command-following. Teaching point: Eyes closed + perturbation = joint position sense."),
    33: ("Neuroscience",
        "Amygdalar activity (function, not structure) is measured with fMRI. CT is structure. DTI is white-matter tracts. PET/SPECT can measure activity but are more invasive, lower resolution, and not first choice for this question. Teaching point: Functional amygdala question → fMRI."),
    34: ("Research Methods",
        "Genotyping thousands of SNPs across many cases vs controls to find frequency differences is a GWAS. Fine mapping narrows a known locus; linkage uses pedigrees; WES reads coding sequence; FISH sees large cytogenetic targets. Teaching point: Lots of SNPs × case–control = GWAS."),
    35: ("Research Methods",
        "Pedigree-based analyses (including quantitative-trait linkage) are used to map loci that contribute to continuously varying familial traits. Common-variant detection in mixed populations is GWAS; TDT looks at transmitted vs non-transmitted alleles; affected-sib-pair sharing is nonparametric linkage. Teaching point: Pedigrees map familial — including quantitative — trait loci."),
    36: ("Psychotherapy",
        "Explaining fight-or-flight as a useful survival system is an adaptive (functional) model of anxiety. Descriptive names the syndrome, mechanistic names circuits/transmitters, ontogenetic names development, environmental names triggers. Teaching point: 'Your alarm system is trying to keep you safe' = adaptive formulation."),
    37: ("Psychotherapy",
        "Time-out works when it is used for one or two target behaviors, is boring (not the bedroom's toys), is not paired with spanking, and is not narrated throughout. A fixed clock ending regardless of calm can reward the tantrum; the child should be calm before release. Teaching point: Time-out: few target behaviors, dull place, no spank, no running commentary."),
    38: ("Psychopathology",
        "Watching oneself from above, time distortion, and odd calm during trauma is depersonalization (detachment from self). Derealization is detachment from the world; illusion/hallucination are perceptual errors; fugue is amnestic wandering. Teaching point: Out-of-body during a crash = depersonalization."),
    39: ("Neuroscience",
        "Intellectual disability, infantile spasms/seizures, and a thickened lumbosacral plaque (shagreen patch) are tuberous sclerosis. Port-wine stain = Sturge–Weber; café-au-lait/neurofibromas = NF1; vestibular schwannomas = NF2; hemangioblastomas = VHL. Teaching point: ID + early seizures + shagreen patch = TSC."),
    40: ("Ethics & Forensics",
        "Sexual-orientation-change efforts are ineffective and harmful (AACAP/APA). Age, family participation, and psychodynamic 'depth' do not make conversion therapy legitimate. Teaching point: Do not offer or endorse reparative therapy; say it does not work and can harm."),
    41: ("Psychopharmacology",
        "Acute psychosis plus malar rash is neuropsychiatric SLE. Initial treatment of significant NP-SLE is corticosteroids (prednisone), not aspirin, and not jumping first to MTX/CYC/HCQ without steroids for this presentation. Teaching point: New psychosis + butterfly rash → steroids for lupus cerebritis."),
    42: ("Psychopathology",
        "Proactive (cold, planned, goal-directed) aggression is the signature of conduct disorder, especially with callous-unemotional traits. Mood, psychotic, and anxiety disorders more often produce reactive/affective aggression. Teaching point: Proactive aggression → conduct disorder."),
    43: ("Development",
        "Warmth plus an invitation to reason ('team sports matter — would you enjoy it?') is authoritative parenting. Authoritarian would decree; permissive would shrug; uninvolved would not engage; 'demanding' is a dimension, not a style. Teaching point: Warm + firm + discussion = authoritative."),
    44: ("Psychopharmacology",
        "Refeeding syndrome's lethal electrolyte shift is hypophosphatemia (also watch K and Mg). Na/Ca/Cl/Cr matter medically but are not the classic refeeding killer. Teaching point: Refeeding → follow phosphate."),
    45: ("Psychopharmacology",
        "Aripiprazole akathisia is treated with propranolol, which also can worsen asthma via beta-blockade. Anticholinergics (benztropine, diphenhydramine) treat dystonia better than akathisia. Dantrolene is for NMS. Mirtazapine is not the ED's first move. Teaching point: Akathisia + new wheeze = someone gave propranolol."),
    46: ("Psychopathology",
        "A year of bedtime stalling, sleep-onset delay, night wakings, and early waking, confined to sleep and without medical/psychiatric competitors, is insomnia disorder. ODD would show daytime defiance. OSA/PLMD need snoring or kicks. ADHD is a daytime attention syndrome. Teaching point: Isolated chronic bedtime battle = pediatric insomnia, not ODD."),
    47: ("Ethics & Forensics",
        "The state taking custody because the infant cannot be safely left with a using parent is parens patriae (the state as parent). Police power protects the public from dangerous persons. Privilege is courtroom evidence law. Dusky is competence to stand trial. Fiduciary is the doctor–patient duty. Teaching point: CPS removal for neglect = parens patriae."),
    48: ("Research Methods",
        "External validity is generalizability. Time-related change in subjects can make findings fail to hold outside the study window. Repeat testing, regression to the mean, and history are classic internal-validity threats; sample-vs-population mismatch is the other major external-validity threat, but the keyed factor here is subject change over time. Teaching point: External validity asks 'will this still be true elsewhere/later?'"),
    49: ("Psychotherapy",
        "Early SUD work, especially with teens, starts with the patient's own stance toward use (MI-style exploration), not lectures, peer confession, DT skills, or parental crackdown. Teaching point: First session in adolescent AUD = explore ambivalence, don't educate or punish."),
    50: ("Psychopathology",
        "Among social-anxiety cognitions, the one that flags suicide risk is painful isolation — wishing not to spend weekends alone. Fear of stuttering, costume regret, and post-hoc embarrassment are typical SAD thoughts; even catastrophic college worry is less specifically tied to suicide than loneliness/thwarted belonging. Teaching point: In SAD, loneliness/isolation is the suicide red flag."),
    51: ("Psychotherapy",
        "Relaxation plus graded exposure to the feared food pairs a incompatible calm response with the CS — counterconditioning (systematic desensitization). Shaping reinforces successive approximations without the incompatible response; modeling is watching someone else; extinction is exposure without the CR being replaced; reinforcement is consequence-based. Teaching point: Relax + hierarchy = counterconditioning."),
    52: ("Ethics & Forensics",
        "The child's fear that session content will be revealed in custody court is about privilege — the legal right to keep treatment communications out of evidence. Duty is the clinician's obligation, competence is capacity, autonomy is self-rule, parens patriae is the state's parenting power. Teaching point: 'Will the judge hear what I said?' = privilege."),
    53: ("Ethics & Forensics",
        "A dying adolescent's withdrawal/anger is best met by including them in decisions about their death, not watchful waiting, automatic antidepressants, distraction, or silence. Teaching point: Hospice teen → share decision-making; don't pretend death isn't happening."),
    54: ("Development",
        "Early declarative (explicit) memory of an event depends on the language available to encode it; a 3-year-old's later verbal memory tracks language ability more than IQ, stamina, mood, or self-regulation. Teaching point: Toddler episodic memory ≈ language at the time of encoding."),
    55: ("Assessment",
        "AIMS includes observation of the tongue at rest (and in motion) for tardive dyskinesia. Vitals, visual fields, tandem gait, and Romberg are not AIMS items. Teaching point: AIMS = watch the tongue."),
    56: ("Development",
        "Healthy ethnic/racial identity is a personal, revisable choice; the therapist supports exploration rather than assigning a multiethnic identity, aligning with one parent, dismissing the pain, or outsourcing the decision to a family session. Teaching point: Identity is chosen and re-chosen; don't pick it for the teen."),
    57: ("Ethics & Forensics",
        "An institution that bars lobbying still allows educational responses to a lawmaker's question. Asking for a vote, staging a protest, running a write-in campaign, or requesting a specific appropriation are lobbying/advocacy the institution forbids. Teaching point: Education ≠ lobbying; answering a legislator's factual question is allowed."),
    58: ("Ethics & Forensics",
        "McKeiver v. Pennsylvania: juveniles have no constitutional right to a jury. They do have due process, counsel, protection from self-incrimination, and (after In re Winship) proof beyond a reasonable doubt. Teaching point: Juvenile court ≠ jury trial."),
    59: ("Psychotherapy",
        "Making the therapist play the child while the child plays the adult reverses roles so the child can actively do what was passively endured — turning passive into active. Projective identification and omnipotent control are different mechanisms; 'working in the displacement' is playing it out with toys rather than role-swapping. Teaching point: Role reversal in play = turning passive into active."),
    60: ("Psychopharmacology",
        "Buprenorphine is started once the adolescent is in mild–moderate opioid withdrawal (to avoid precipitated withdrawal). Methadone can be started without waiting but is tightly regulated. Naltrexone and acamprosate require abstinence; varenicline is for nicotine and is not a withdrawal-induction drug. Teaching point: Start buprenorphine in withdrawal."),
    61: ("Neuroscience",
        "GRM3 / mGluR3 variants are among the more consistent GWAS signals for schizophrenia/psychotic disorders, not for bipolar, anxiety, depression, or ASD. Teaching point: GRM3 → psychosis risk."),
    62: ("Development",
        "Side-by-side play with little interaction (each calling their own parent) is parallel play, typical of preschool. Cooperative play is shared goals; symbolic/fantasy is pretend; constructive is building. Teaching point: Next to each other, not with each other = parallel play."),
    63: ("Development",
        "Earlier motor milestones in many traditional African caregiving systems reflect deliberate teaching/practice (stretching, sitting/standing training), not nutrition, temperament, or 'more stimulation' in the Western cognitive sense, and not isolation. Teaching point: Motor timing is trained, not just maturational."),
    64: ("Development",
        "The Grant/Harvard Adult Development study's standout childhood predictor of later adaptation and success is warm relationships, not IQ, extraversion, SES, or looks. Teaching point: Warm childhood relationships beat status and smarts for later flourishing."),
    65: ("Psychopathology",
        "After a fire, two weeks of irritability, 'get me out,' restless sleep, and trauma-related amnesia, with preserved alertness/attention, is acute stress disorder (3 days–1 month post-trauma). Delirium would fluctuate attention. PTSD requires >1 month. Mood disorder and simple phobia don't capture the trauma cluster. Teaching point: Attentive + post-trauma cluster at 2 weeks = ASD, not delirium."),
    66: ("Systems & Prevention",
        "The most common permanency outcome after CPS removal is reunification with parents. Kinship, guardianship, adoption, and emancipation are less frequent as the final path. Teaching point: Most removed children go home."),
    67: ("Development",
        "School-age Erikson is industry vs inferiority — competency. A year of virtual school then a hard return is a hit to that stage. Fidelity is adolescence (identity), hope/purpose/wisdom are other Eriksonian virtues. Teaching point: Grade-school depression after disrupted school → assess competency/industry."),
    68: ("Psychopathology",
        "Insomnia, headache, depressed mood, and restlessness a week after stopping daily use is the cannabis withdrawal syndrome. Opioid and alcohol withdrawal are more autonomic/GI or dangerous; caffeine withdrawal is earlier headache; zolpidem is GABA-sedative withdrawal. Teaching point: Irritable, sleepless, headachy at day 7 = cannabis withdrawal."),
    69: ("Psychopathology",
        "ADHD is the most common psychiatric comorbidity of pediatric epilepsy (ahead of depression, anxiety, conduct, and FND). Teaching point: Child with epilepsy → screen ADHD."),
    70: ("Development",
        "Restrictive/controlling parenting is often a liability in safe settings but is protective in high-crime neighborhoods (monitoring reduces exposure). It is not specifically protective for teen parents, post-trauma, privilege, or religiosity. Teaching point: Strict parenting can be adaptive when the street is dangerous."),
    71: ("Assessment",
        "CT beats MRI for bone (skull fracture, calcifications) and is faster in trauma. Edema, white matter, acute infarct, and CSF flow are MRI's territory. Teaching point: Bone question → CT."),
    72: ("Psychotherapy",
        "Recurrent angry, argumentative responses to 'no' is ODD; the best-supported therapy in young children is parent–child interaction training (PCIT / parent management). Play, IPT, psychodynamic, and child-only CBT are not first-line for this. Teaching point: Young ODD → parent–child interaction therapy."),
    73: ("Psychotherapy",
        "Stopping the aversive questioning when the teen meets curfew removes an unpleasant stimulus contingent on the desired behavior — negative reinforcement (increases on-time return). Punishment decreases a behavior; positive reinforcement would add a pleasant stimulus; Pavlovian is pairing, not consequence. Teaching point: Take away nagging when they're on time = negative reinforcement."),
    74: ("Psychopharmacology",
        "High-quality evidence for antipsychotic-associated weight gain in youth supports switching to aripiprazole (more weight-neutral) rather than to risperidone/olanzapine (worse) or adding valproate (more weight) or a stimulant. Teaching point: Quetiapine weight gain → switch to aripiprazole."),
    75: ("Research Methods",
        "A moderator is a baseline variable that changes the size/direction of the treatment effect — here, comorbid ADHD altered risperidone's TEAM effectiveness. A covariate is adjusted for; a confounder distorts a causal estimate; dependent/independent are outcome/predictor roles, not this relationship. Teaching point: 'It worked differently if they had ADHD' = moderator."),
    76: ("Psychotherapy",
        "Habit reversal training starts with awareness training (self-monitoring of the tic), then competing-response training, with relaxation and functional assessment as supports. Stimulus control is more a habit-disorder/sleep tool. Teaching point: HRT step 1 = awareness."),
    77: ("Neuroscience",
        "Chromosomal microarray detects large deletions/duplications (CNVs). Sanger/NGS read sequence; PCR amplifies targets; Southern blot is older fragment analysis, not the first-line CNV test. Teaching point: Big del/dup → CMA."),
    78: ("Psychopharmacology",
        "Severe preschool ADHD that has already failed behavioral/daycare containment still starts with a stimulant; methylphenidate has the best preschool evidence (PATS). Alpha-agonists and atomoxetine are alternatives; risperidone is not ADHD first-line; imipramine is outdated. Teaching point: Preschool ADHD med #1 = methylphenidate."),
    79: ("Psychotherapy",
        "In bell-and-pad conditioning the alarm is the US (wakes the child). After pairing, bladder fullness — previously unnoticed — becomes the CS that elicits waking (CR). Urination is the behavior being trained; wet sheets are incidental; the alarm is unconditioned; waking is the response, not the CS. Teaching point: Full-bladder sensation is the conditioned stimulus."),
    80: ("Ethics & Forensics",
        "A subpoena is not a court order and does not, by itself, waive privilege. Show up, assert privilege, and answer only if the judge directs you to. Don't mail the chart, don't spill, and don't ignore the subpoena. Teaching point: Subpoena ≠ authorization; appear and wait for the judge."),
    81: ("Psychotherapy",
        "A maltreated mother's reading of the infant's cry as 'you don't feel loved' is a reenactment of her own attachment history onto the baby. Rapprochement is a separation-individuation subphase; Oedipal is triangular; integration/splitting are object-relations operations, not this misread. Teaching point: Past abuse scripted onto the infant = reenactment."),
    82: ("Assessment",
        "A reading-disabled child who did well with an early IEP and then sinks in 5th grade, when written output explodes, most often has an emerging written-expression disability. Phonological awareness should already have been the grade-2 issue; oral language, listening, and math are less tied to this new homework refusal. Teaching point: Late-elementary crash after a reading IEP → written expression."),
    83: ("Assessment",
        "Irritability, hypersomnolence, inattention, restless sleep, and loud snoring = suspect OSA; gold standard is overnight polysomnography. Diaries, questionnaires, and actigraphy screen; MSLT is for narcolepsy once sleep-disordered breathing is excluded. Teaching point: Snoring + school problems → PSG."),
    84: ("Psychopathology",
        "Stereotypies are often self-soothing, rhythmic, and start earlier; tics are more suppressible, less soothing, and more involuntary-feeling. Both can be repetitive and 'purposeless.' Teaching point: If it soothes, think stereotypy, not tic."),
    85: ("Psychopathology",
        "Interpersonal trauma by a caregiver (physical abuse) carries the highest pediatric PTSD risk. Disasters, accidents, bereavement, and media exposure are lower-risk on average. Teaching point: Worst PTSD risk = abuse by the person who should protect you."),
    86: ("Development",
        "Preschoolers may touch their own genitals, peek at parents, grab a mother's breast, or play 'dating.' Touching a peer's genitals is outside typical and is the problematic behavior to assess. Teaching point: Peer genital touching at 4 is not normative curiosity."),
    87: ("Neuroscience",
        "Infant, new food, descending hypotonia, constipation, poor feed, dilated pupils = infant botulism. EMG (facilitating compound muscle action potentials) supports the diagnosis; brain MRI/EEG/PET/US do not. Teaching point: Floppy baby after honey/new food → EMG for botulism."),
    88: ("Ethics & Forensics",
        "Serving as both treating psychiatrist and school consultant creates dual roles; fidelity (loyalty to the patient, keeping promises, avoiding conflicting allegiances) is the principle most at stake. Justice is fairness of distribution; autonomy/beneficence/nonmaleficence are important but not the dual-agency issue. Teaching point: Two hats → fidelity / conflict of interest."),
    89: ("Psychopathology",
        "ARFID is restriction without weight/shape fear, binge sense of loss of control, or compensatory behaviors. Sensory aversion is a common ARFID driver. Teaching point: Picky to the point of failure to thrive, no body-image fear = ARFID."),
    90: ("Research Methods",
        "NNH = 1 / absolute risk increase. ARI = 0.03 − 0.02 = 0.01, so NNH = 100. Teaching point: NNH = 1 / (risk_tx − risk_control)."),
    91: ("Ethics & Forensics",
        "A child's capacity for end-of-life decisions is judged by developmental understanding, not a birthday, parental religion, or cultural history alone. Autonomy is the value; developmental understanding is the test. Teaching point: Capacity tracks understanding, not chronological age."),
    92: ("Psychopharmacology",
        "Fever, headache, stiff neck, normal opening pressure, lymphocytic aseptic meningitis on a mood stabilizer is a lamotrigine (and sometimes carbamazepine) adverse effect; the keyed agent is lamotrigine. VPA, lithium, and topiramate do not present this way. Teaching point: Aseptic meningitis on a mood stabilizer → lamotrigine."),
    93: ("Systems & Prevention",
        "Organizational barriers to measurement-based care include EMR integration (and workflow/IT). Cost, time to complete scales, confidentiality worry, and clinician preference are patient- or clinician-level barriers. Teaching point: Clinic-level MBC barrier = getting scores into the EMR."),
    94: ("Neuroscience",
        "EEG alpha (posterior dominant rhythm) is paced by thalamic (and thalamocortical) oscillators, not pons, insula, amygdala, or cerebellum. Teaching point: Alpha pacemaker = thalamus."),
    95: ("Psychopathology",
        "ICU, meningitis, hospital day 3, fluctuating irritability/sleep/eye contact with an otherwise unchanged neuro exam is delirium. Adjustment/ASD are more persistent and less waxing. TIA and autoimmune encephalitis would usually add focal or progressive neurologic signs. Teaching point: Fluctuating mental status in a sick hospitalized teen = delirium."),
    96: ("Psychopathology",
        "The strongest risk factor for enuresis is a first-degree family history (here, father). Female sex is protective (boys wet more). Early/strict toilet training and separation anxiety are weakly related or unrelated. Teaching point: Enuresis runs in families; training style is not the main cause."),
    97: ("Neuroscience",
        "Upper-motor-neuron signs include spasticity, hyperreflexia, and upgoing toes. Hypotonia, fasciculations, and absent DTRs are lower-motor-neuron; burning feet is neuropathic sensory. Teaching point: Spasticity = UMN."),
    98: ("Psychotherapy",
        "In supportive therapy, positive transference is not interpreted; it is used to deliver encouragement and practical advice. Dream work, neutrality/limit-setting, and grief reconstruction belong to uncovering/expressive therapies. Poor reality testing is not implied by a warm grandparent transference. Teaching point: Supportive therapy uses the transference; it does not interpret it."),
    99: ("Psychopathology",
        "Irritability after parental divorce without sad mood, sleep/appetite change, or school drop is adjustment disorder because neurovegetative/MDD criteria are absent. Duration (2 months) and presence of a stressor fit both; 'not sad' is allowed in child MDD (irritable mood counts). Impairment is not detailed as absent. Teaching point: No vegetative symptoms → adjustment, not MDD."),
    100: ("Consultation & Schools",
        "The school psychologist's distinctive job is psychoeducational testing (IQ, achievement, processing). Curriculum redesign is the teacher/special-ed team; psychosocial treatment is the clinician; family liaison is often the social worker/counselor; sensory strategies are OT. Teaching point: School psychologist = testing."),
}


def clean(s: str) -> str:
    s = (s or "").replace("\\'", "'").replace('\\"', '"')
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", s).strip()


def _para_text(p: ET.Element) -> str:
    return "".join((t.text or "") for t in p.iter(f"{W}t")).strip()


def _is_correct(p: ET.Element) -> bool:
    ppr = p.find(f"{W}pPr")
    if ppr is not None:
        shd = ppr.find(f"{W}shd")
        if shd is not None and (shd.get(f"{W}fill") or "").upper() == CORRECT_FILL:
            return True
    return "Correct Answer" in _para_text(p)


def _has_drawing(p: ET.Element) -> bool:
    return p.find(f".//{W}drawing") is not None


def parse_docx(path: Path) -> list[dict]:
    """Parse Q101–200 from the keyed Word quiz (green-shaded correct options)."""
    with ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    qs: list[dict] = []
    cur: dict | None = None
    for p in root.iter(f"{W}p"):
        style_el = p.find(f"{W}pPr/{W}pStyle")
        style = style_el.get(f"{W}val") if style_el is not None else None
        text = _para_text(p)
        if style == "Heading2" and text.startswith("Question "):
            if cur:
                qs.append(cur)
            cur = {"n": int(text.split()[-1]), "blocks": []}
            continue
        if cur is None:
            continue
        cur["blocks"].append({"text": text, "correct": _is_correct(p), "drawing": _has_drawing(p)})
    if cur:
        qs.append(cur)

    out: list[dict] = []
    letters = "ABCDEFGHIJ"
    for q in qs:
        stem = ""
        opts: list[dict] = []
        has_img = False
        for b in q["blocks"]:
            if b["drawing"]:
                has_img = True
                continue
            txt = b["text"]
            if not txt or txt.startswith("Centers for Disease Control"):
                continue
            if not stem:
                stem = clean(txt)
                continue
            opt = clean(re.sub(r"\s*✓\s*Correct Answer\s*", "", txt))
            if not opt:
                continue
            opts.append({"letter": letters[len(opts)], "text": opt, "correct": b["correct"]})
        answers = [o["letter"] for o in opts if o["correct"]]
        if not stem or not opts or not answers:
            raise SystemExit(f"Bad DOCX parse Q{q['n']}: stem={bool(stem)} nopts={len(opts)} answers={answers}")
        multi = "(Select" in stem or len(answers) > 1
        if multi and len(answers) != 3:
            raise SystemExit(f"Q{q['n']} expected 3 answers, got {answers}")
        if not multi and len(answers) != 1:
            raise SystemExit(f"Q{q['n']} expected 1 answer, got {answers}")
        out.append({
            "n": q["n"],
            "stem": stem,
            "options": [{"letter": o["letter"], "text": o["text"]} for o in opts],
            "answer": answers[0],
            "answers": answers,
            "multi": multi,
            "has_img": has_img,
        })
    if len(out) != 100 or out[0]["n"] != 101 or out[-1]["n"] != 200:
        raise SystemExit(f"Expected Q101–200, got {len(out)} items {[x['n'] for x in out[:3]]}…")
    return out


def parse_md(path: Path) -> list[dict]:
    text = path.read_text()
    parts = re.split(r"\n(?=\*\*\d+\.\s)", text)
    qs: list[dict] = []
    for p in parts:
        p = p.strip()
        m = re.match(r"\*\*(\d+)\.\s*(.*)", p, re.S)
        if not m:
            continue
        n = int(m.group(1))
        body = m.group(2)
        opt_start = re.search(r"\n>\s", body)
        if not opt_start:
            raise SystemExit(f"No options for Q{n}")
        stem = clean(re.sub(r"\*+$", "", body[: opt_start.start()]))
        rest = body[opt_start.start() :]
        raw_opts: list[str] = []
        cur: list[str] = []
        for line in rest.splitlines():
            if line.startswith(">"):
                t = line[1:].strip()
                if t == "":
                    if cur:
                        raw_opts.append(" ".join(cur))
                        cur = []
                else:
                    cur.append(t)
            elif line.strip() == "" and cur:
                raw_opts.append(" ".join(cur))
                cur = []
        if cur:
            raw_opts.append(" ".join(cur))
        letters = "ABCDE"
        options = []
        answer = None
        for i, o in enumerate(raw_opts[:5]):
            correct = "*(Correct" in o
            o = clean(re.sub(r"\*+\s*\(Correct Answer\)\s*\*+", "", o).replace("**", ""))
            options.append({"letter": letters[i], "text": o})
            if correct:
                answer = letters[i]
        if not answer or len(options) != 5:
            raise SystemExit(f"Bad parse Q{n}: answer={answer} nopts={len(options)}")
        qs.append({"n": n, "stem": stem, "options": options, "answer": answer})
    if len(qs) != 100:
        raise SystemExit(f"Expected 100 questions, got {len(qs)}")
    return qs


def first_sentence(text: str, max_len: int = 280) -> str:
    t = clean(text)
    for i, ch in enumerate(t):
        if ch in ".!?" and i > 40:
            t = t[: i + 1]
            break
    return t if len(t) <= max_len else t[: max_len - 1].rstrip() + "…"


def teaching_point(expl: str) -> str:
    low = expl.lower()
    i = low.rfind("teaching point:")
    if i < 0:
        return ""
    return clean(expl[i + len("Teaching point:") :])


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "topic"


def record(q: dict, topic: str, expl: str, clinical: str, source: str) -> dict:
    letters = q.get("answers") or [q["answer"]]
    chosen = [o for o in q["options"] if o["letter"] in letters]
    ans_text = " / ".join(o["text"] for o in chosen)
    multi = bool(q.get("multi")) or len(letters) > 1
    figs = [Q134_FIG] if q.get("has_img") or q["n"] == 134 else []
    return {
        "deck": "CPRITE 2024",
        "year": "CPRITE 2024",
        "q_index": q["n"],
        "slide_number": 0,
        "stem": q["stem"],
        "options": q["options"],
        "answer_letter": letters[0],
        "answer_letters": letters,
        "multi_select": multi,
        "answer_text": ans_text,
        "answer_source": "letter" if not multi else "multi",
        "answer_raw": f"{letters[0]}. {chosen[0]['text']}" if not multi else "".join(letters),
        "explanation_text": expl,
        "figure_images": figs,
        "explanation_images": [],
        "flags": [],
        "prite_category": slug(topic),
        "prite_label": topic,
        "clinical_application": clinical,
        "video_query": f"{topic} {ans_text} child psychiatry",
        "tags": {
            "diagnosis": [],
            "medication": [],
            "psychotherapy": [],
            "neuro": [],
            "historical": [],
            "setting": None,
            "topics": [topic, "CPRITE 2024"],
        },
        "cprite": {
            "exam": "CPRITE",
            "exam_year": 2024,
            "topic": topic,
            "source": source,
        },
    }


def build_first_100() -> list[dict]:
    parsed = parse_md(SRC_MD)
    missing = [q["n"] for q in parsed if q["n"] not in META]
    if missing:
        raise SystemExit(f"Missing META for {missing}")
    out = []
    for q in parsed:
        topic, expl = META[q["n"]]
        clinical = CLINICAL.get(q["n"])
        if not clinical:
            raise SystemExit(f"Missing CLINICAL for Q{q['n']}")
        q["answers"] = [q["answer"]]
        q["multi"] = False
        q["has_img"] = False
        out.append(record(q, topic, expl, clinical, "CPRITE 2024 practice quiz Q1–100"))
    return out


def build_101_200() -> list[dict]:
    if not SRC_DOCX_101.exists():
        raise SystemExit(f"Missing {SRC_DOCX_101}")
    parsed = parse_docx(SRC_DOCX_101)
    out = []
    for q in parsed:
        if q["n"] not in META_101:
            raise SystemExit(f"Missing META for Q{q['n']}")
        if q["n"] not in CLINICAL_101:
            raise SystemExit(f"Missing CLINICAL for Q{q['n']}")
        topic, expl = META_101[q["n"]]
        out.append(record(q, topic, expl, CLINICAL_101[q["n"]], "CPRITE 2024 practice quiz Q101–200"))
    return out


def build() -> list[dict]:
    if SRC_MD.exists():
        first = build_first_100()
    elif OUT.exists():
        existing = json.loads(OUT.read_text())
        first = [q for q in existing if int(q.get("q_index") or 0) <= 100]
        if len(first) != 100:
            raise SystemExit(f"Expected 100 existing Q1–100, found {len(first)}")
    else:
        raise SystemExit(f"Need {SRC_MD} or an existing {OUT} with Q1–100")
    rest = build_101_200()
    bank = first + rest
    if len(bank) != 200:
        raise SystemExit(f"Expected 200 questions, got {len(bank)}")
    return bank


def main() -> None:
    bank = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n")
    topics: dict[str, int] = {}
    multi = 0
    for q in bank:
        t = q["cprite"]["topic"]
        topics[t] = topics.get(t, 0) + 1
        if q["multi_select"]:
            multi += 1
    print(f"Wrote {len(bank)} questions ({multi} multi-select) → {OUT}")
    for t, n in sorted(topics.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:3}  {t}")


if __name__ == "__main__":
    main()
