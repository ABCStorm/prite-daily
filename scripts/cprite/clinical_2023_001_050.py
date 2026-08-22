"""In-practice vignettes for CPRITE 2023 Q1–50.

Resident-in-the-room scene, what they actually do with the fact, one-line Bottom line.
"""

CLINICAL: dict[int, str] = {
    1: (
        "At a 10-month visit, parents worry the baby 'sometimes ignores her name.' "
        "The resident explains selective name recognition is expected around nine months, so this is on time. "
        "They do not start an autism workup for a six-month-old who orients to voice but is not yet selective. "
        "Bottom line: Selective own-name recognition is a nine-month milestone."
    ),
    2: (
        "A 17-year-old reports he cannot ejaculate with a partner after hours of internet porn. "
        "The resident names delayed ejaculation as the associated dysfunction and asks about porn volume before starting a PDE5 inhibitor. "
        "They do not diagnose erectile disorder from 'it takes forever' alone. "
        "Bottom line: Heavy teen porn use maps to delayed ejaculation, not ED."
    ),
    3: (
        "A fellow waves a single CNV paper linking a rare deletion to psychosis and wants to change counseling scripts. "
        "The attending has them treat it as a lead, not a closed case: rare variants need replication. "
        "They do not tell families that one array study proves causation. "
        "Bottom line: Molecular cytogenetic hits are not conclusive from one study."
    ),
    4: (
        "A 14-month-old has just started walking: darts off, then loops back to check mom. "
        "The resident maps that practicing loop to Mahler and normal separation-individuation, not a new anxiety disorder. "
        "Sitting and first words are not the physical correlate they quote. "
        "Bottom line: Mahler's separation work is timed to walking."
    ),
    5: (
        "In play therapy, a six-year-old who watched his father hit his mother has the doll punch the therapist's doll for snacks. "
        "The resident formulates modeled aggression (social learning), not a snack-operant they accidentally created. "
        "They do not launch cognitive restructuring with a first-grader mid-reenactment. "
        "Bottom line: Violence replayed in play is social learning."
    ),
    6: (
        "A 16-year-old has minutes-long palpitations and doom only when presenting or meeting new people, and she fears looking stupid. "
        "The resident diagnoses social anxiety, not panic disorder, and plans exposure to performance, not a surprise-attack protocol. "
        "They do not call it GAD because worry is cue-bound. "
        "Bottom line: Panic-like attacks cued by people and embarrassment are social anxiety."
    ),
    7: (
        "Parents are divorcing; the teen in IPT-A is failing classes and snapping at the remaining parent. "
        "The resident names family structural change as the problem area and works that, not abstract-thinking drills or a sexuality module. "
        "School refusal is a symptom, not the IPT domain. "
        "Bottom line: IPT-A's adolescent-specific domain is family structural change."
    ),
    8: (
        "An immigrant family describes a cousin's suicide as the only way out of public shame, not as an illness. "
        "The resident takes that cultural frame seriously instead of forcing a Western mental-illness script. "
        "They still assess risk; they do not argue means access as the family's theory of why it happened. "
        "Bottom line: Many non-Western views treat suicide as a solution to a dilemma."
    ),
    9: (
        "An intake is 'ADHD plus rage — please start risperidone.' "
        "The resident starts methylphenidate and parent management; mood stabilizers wait. "
        "They do not open with divalproex, atomoxetine, or a benzo. "
        "Bottom line: ADHD with aggression still starts with a stimulant."
    ),
    10: (
        "In the dollhouse a four-year-old's figure hits the others and says 'you're bad' and 'I hate you.' "
        "The resident documents mood as angry/dysphoric from the play theme. "
        "They do not file it as homicidal thought content or a thought-process problem. "
        "Bottom line: Preschool play themes score MSE mood."
    ),
    11: (
        "Genetics clinic: a parent carries a rare psychiatric-risk variant and has never been ill; the child has the same variant and is quite ill. "
        "The resident names incomplete penetrance so the family does not hear 'the gene always means the disease.' "
        "They do not call it polygenic load or a phenocopy. "
        "Bottom line: Gene without the phenotype in every carrier is incomplete penetrance."
    ),
    12: (
        "In infant-parent work a mother asks what actually 'builds' her baby besides feeding and milestones. "
        "The resident talks Winnicott: the dyad as a holding, facilitating emotional environment. "
        "They do not lecture psychoeducation, cultural assimilation, or family EE as Winnicott's idea. "
        "Bottom line: Winnicott's core is the facilitating infant-caretaker dyad."
    ),
    13: (
        "A parent wants to email daily mood logs from a personal Gmail and copy the teen's other guardian. "
        "The resident offers email only for appointment times and moves clinical content to the portal or a call. "
        "They do not start the relationship, change meds, or discuss the teen over unencrypted mail. "
        "Bottom line: Unencrypted email is for scheduling, not clinical care."
    ),
    14: (
        "Journal club: a tightly controlled university RCT of a new anxiety protocol. "
        "The fellow asks whether the sample, setting, and inclusion rules look like this clinic — external validity — before adopting it. "
        "They do not treat a high internal-validity p-value or an NNT as proof it will travel. "
        "Bottom line: Generalizability is external validity."
    ),
    15: (
        "A resident is subpoenaed to testify about what they documented as the treating psychiatrist — fact witness, not expert. "
        "They do not send an hourly invoice, bill insurance, or charge the family for court time. "
        "Expert-fee negotiation is the other job. "
        "Bottom line: Fact witnesses are not reimbursed for their time."
    ),
    16: (
        "A teen with temporal-lobe epilepsy develops hallucinations and a new delusion. "
        "The resident localizes the psychosis risk to temporo-limbic structures and involves neurology, not a frontal or pituitary story. "
        "They do not treat it as coincidental primary schizophrenia until the epilepsy map is considered. "
        "Bottom line: Psychosis in epilepsy maps to temporo-limbic pathology."
    ),
    17: (
        "After a tantrum a five-year-old sobs, 'I still love Mommy,' and can use a calm-down corner. "
        "The resident names object constancy: she can hold a good caregiver image while angry. "
        "They do not call it theory of mind, rapprochement crisis, or reaction formation. "
        "Bottom line: Self-soothing with an inner good parent is object constancy."
    ),
    18: (
        "A Black teen is referred 'for schizophrenia' after a trauma-and-mood picture that would have been called mood or PTSD in a White peer. "
        "The resident slows the label, documents the disparity, and does not reach for ethnic, poverty, prenatal, or genetic explanations first. "
        "They treat the actual syndrome in front of them. "
        "Bottom line: Excess psychosis diagnoses in Black youth are a structural-racism problem."
    ),
    19: (
        "Trauma consult: cribriform-plate fracture after an MVC. "
        "The resident tests smell with peppermint before worrying about gag, eyelids, tongue, or jaw. "
        "CN I rides through that plate. "
        "Bottom line: Cribriform injury → check olfaction."
    ),
    20: (
        "A foster child bolts to the closet when the garage door opens, years after the abusive parent left; hiding never stopped the beatings. "
        "The resident explains a classically conditioned fear to the sound, not an operant hide that 'worked.' "
        "They do not call it learned helplessness. "
        "Bottom line: A leftover fear cue is classical conditioning."
    ),
    21: (
        "A family considering epilepsy surgery after failed meds and ketogenic diet is terrified the child will lose language. "
        "The resident orders fMRI for language mapping, not DTI, MRA, MRS, or CSF-flow studies. "
        "That is the study that answers their question. "
        "Bottom line: Language-risk questions before epilepsy surgery → fMRI."
    ),
    22: (
        "Lithium level is unexpectedly low in a teen who just started energy drinks. "
        "The resident names caffeine as the culprit and does not blame ibuprofen or a thiazide, which would have pushed the level up. "
        "They cut the caffeine and recheck rather than reflexively raising the dose. "
        "Bottom line: Caffeine lowers lithium."
    ),
    23: (
        "A school-community meeting asks what actually counts as alcohol harm reduction for adolescents. "
        "The fellow lists random roadside drug testing, not sales bans, media campaigns, MI, or peer self-help. "
        "Those others are prevention or treatment. "
        "Bottom line: The keyed adolescent alcohol harm-reduction tool is random roadside testing."
    ),
    24: (
        "Parents of a child with ASD put him in timeout whenever homework screaming starts; homework then stops. "
        "The resident has them ignore the scream and steer him back to the worksheet so escape is not reinforced. "
        "No extra timeout, no ending the task, no token for the scream. "
        "Bottom line: Escape-maintained screaming ends when you ignore it and return to the work."
    ),
    25: (
        "On an infant consult the fellow starts to skip to 'speech and hyperactivity.' "
        "The attending has them watch a feed: latch, alertness, gaze, regulation. "
        "That is the infant-specific MSE piece; dysmorphisms can wait for the general exam. "
        "Bottom line: Infant mental status includes feeding behavior."
    ),
    26: (
        "A preschooler with PTSD barely uses the parent as a base and explodes over small cues. "
        "The resident refers a manualized dyadic parent-child interaction treatment, not weekly play therapy or adolescent-style CBT. "
        "MDFT and family psychodynamic work are the wrong age and evidence tier. "
        "Bottom line: Young child, trauma, poor attachment → dyadic parent-child therapy."
    ),
    27: (
        "A neurologist asks which scan shows connectivity in a child with a neurodevelopmental disability. "
        "The resident orders DTI, not another structural MRI, CT, PET, or MRS. "
        "Tracts, not chemistry or metabolism, are the question. "
        "Bottom line: Neuronal connectivity → diffusion tensor imaging."
    ),
    28: (
        "A 12-year-old is admitted after a suicide attempt. "
        "The resident asks specifically about ligatures and hanging, the leading completion method at 10-14, not only pills or cutting. "
        "Means restriction at home follows that map. "
        "Bottom line: Completed suicide at 10-14 is most often suffocation."
    ),
    29: (
        "A 16-year-old spent five days irritable, organizing the house all night, still making it to school, talking out of turn, and dressing provocatively. "
        "The resident diagnoses a bipolar-spectrum episode, not new ADHD, ODD, or DMDD. "
        "Decreased need for sleep plus a days-long shift is the tell. "
        "Bottom line: A discrete irritable high with no-sleep energy is bipolar, not DMDD."
    ),
    30: (
        "A girl with bulimia has unstable relationships, self-injury, and frantic abandonment fears. "
        "The resident screens for borderline PD as the most frequent personality comorbidity, not OCPD (more the restricting-anorexia pairing). "
        "They do not wave off the personality pattern as 'just the eating disorder.' "
        "Bottom line: BN plus a personality disorder usually means borderline."
    ),
    31: (
        "A teen with new relapsing-remitting MS needs a disease-modifying drug, not another steroid burst. "
        "The resident starts interferon as first-line DMT and does not open with natalizumab, mitoxantrone, or cyclophosphamide. "
        "Prednisone is for the acute attack. "
        "Bottom line: Pediatric MS first-line DMT is interferon."
    ),
    32: (
        "IRB: a study offers $100 to adolescents who finish every visit. "
        "The fellow flags coercion of a money-sensitive teen as the live issue, not a blanket ban on payment or an assumption that mentally ill youth cannot consent. "
        "Parents still consent; that is not the main worry. "
        "Bottom line: Paying adolescent research subjects, watch for undue influence."
    ),
    33: (
        "Chronic anorexia, HR 60, BP 100/80, still losing ground in clinic, missing school. "
        "The resident recommends residential ED treatment, not a medical floor (she is not crashing) and not general inpatient psych. "
        "PHP/IOP wait until home-based care can hold the weight. "
        "Bottom line: Outpatient-failing, medically stable AN goes to residential."
    ),
    34: (
        "A detention psychiatrist is asked to order 48 hours of isolation 'for discipline' after a fight. "
        "The resident refuses: AACAP strongly discourages isolation over 24 hours in all cases. "
        "A child psychiatrist's signature does not make it appropriate, and it is not preferred over medication. "
        "Bottom line: Isolation >24 hours for confined youth is not acceptable."
    ),
    35: (
        "A 17-year-old stable on risperidone develops galactorrhea; pregnancy test is negative and prolactin is high. "
        "The resident switches to aripiprazole rather than adding bromocriptine, a benzo, or benztropine. "
        "Lurasidone is also sparing but is not the move they make. "
        "Bottom line: Risperidone hyperprolactinemia → switch to aripiprazole."
    ),
    36: (
        "Discharge after a first cannabis-associated psychosis. "
        "The resident tells the family this substance, among common intoxicants, has the strongest link to later schizophrenia and plans close follow-up. "
        "They do not give the same conversion speech for alcohol. "
        "Bottom line: Cannabis-induced psychosis is the highest-risk precursor of schizophrenia."
    ),
    37: (
        "A fellow reviewing stress-biology slides before a foster-care talk. "
        "They remember the acute plasma bump is interleukin-6, not monocytes, CD4 cells, B cells, or TNF-alpha. "
        "The slide does not change today's SSRI, but it keeps the mechanism honest. "
        "Bottom line: Acute stress raises IL-6."
    ),
    38: (
        "A 15-year-old with needle phobia starts CBT. "
        "The resident builds a hierarchy and begins graduated exposure rather than opening with thought records or insight that the fear is 'irrational.' "
        "Processing the emotion can wait; the needle has to get closer. "
        "Bottom line: Specific phobia treatment is exposure."
    ),
    39: (
        "An IEP student has been out of class for twelve school days of suspension. "
        "The consultant calls for a manifestation determination review under IDEA, not because of the disability category but because placement changed more than ten days. "
        "A two-day detention would not have triggered it. "
        "Bottom line: IDEA MDR is for a placement change of more than ten days."
    ),
    40: (
        "New psychosis: neurology wonders about epileptiform psychosis versus schizophreniform. "
        "The resident leans schizophreniform when affect is flattened; hallucinations and delusions do not decide it. "
        "They still get an EEG when seizures are in the story, but negative symptoms are the clinical discriminator. "
        "Bottom line: Flat affect favors schizophreniform over seizure psychosis."
    ),
    41: (
        "Foster parents ask whether 'trauma is in her genes now.' "
        "The resident explains the most established epigenetic finding after childhood sexual abuse is altered glucocorticoid-receptor expression, not a dopamine or serotonin receptor assay they can order. "
        "No blood test will 'prove' the abuse. "
        "Bottom line: Abuse-related epigenetics points to the glucocorticoid receptor."
    ),
    42: (
        "A city-council consult on child mental-health prevention. "
        "The resident cites childhood green-space exposure as a factor that appears to lower later psychiatric-disorder risk, not apartment living, religiosity, or family structure. "
        "They do not claim urban life is protective. "
        "Bottom line: More green space in childhood is linked to less adult psychiatric illness."
    ),
    43: (
        "Day 14 of an antipsychotic, already up several pounds. "
        "The resident treats that early bump as predictive of later gain (TEA) and tightens diet, activity, and monitoring now, not after a 10% plateau. "
        "They do not wait for it to 'come back to baseline.' "
        "Bottom line: Two-week antipsychotic weight gain predicts later gain."
    ),
    44: (
        "A researcher assigns five schools to a social-emotional curriculum and five to control by lottery. "
        "The fellow writes cluster randomization in the methods, not factorial, crossover, or time series. "
        "Kids are nested in schools; the school was the unit of randomization. "
        "Bottom line: Lottery at the school level is a cluster RCT."
    ),
    45: (
        "During refeeding a teen asks why she is ravenous after weight loss. "
        "The resident explains that falling leptin (not rising ghrelin as the 'when it drops' signal) drives appetite up. "
        "They do not blame orexin, NPY, or cortisol for that pattern. "
        "Bottom line: When leptin falls, appetite rises."
    ),
    46: (
        "A 10-year-old has years of medical-negative belly pain. "
        "The resident takes a careful history of the mother's anxiety and depression rather than hunting ADHD or assuming neglect. "
        "They also screen the child; absence of child anxiety would have been the wrong prediction. "
        "Bottom line: Functional abdominal pain tracks maternal anxiety and depression."
    ),
    47: (
        "Two students with similar fight histories; the Black student is the one sent to the office. "
        "The resident names the ABCD finding — Black race had the highest adjusted odds of detention/suspension — and advocates with the school rather than blaming parent education or special-ed status. "
        "Same externalizing, different punishment. "
        "Bottom line: At equal behavior, Black students are suspended more."
    ),
    48: (
        "A sleepy teen with a flipped clock asks 'where is the clock in the brain?' "
        "The resident points to the suprachiasmatic nucleus, which takes retinal input, not arcuate, supraoptic, ventromedial, or paraventricular. "
        "That is the diurnal-rhythm nucleus. "
        "Bottom line: Retina to SCN sets the day-night clock."
    ),
    49: (
        "Parents of a child with ASD ask which 'face area' the neurologist meant. "
        "The resident names the lateral fusiform gyrus (FFA), not thalamus, hippocampus, prefrontal cortex, or corpus callosum. "
        "They do not promise an FFA scan will diagnose autism. "
        "Bottom line: Face processing in ASD implicates the lateral fusiform gyrus."
    ),
    50: (
        "Conduct-disordered teen from a high-poverty block; the team wants a peer or school-climate fix first. "
        "The resident targets parenting practices as the mediator of both SES and neighborhood effects. "
        "IQ and temperament are not the lever they pick. "
        "Bottom line: SES and neighborhood hit conduct disorder through parenting."
    ),
}
