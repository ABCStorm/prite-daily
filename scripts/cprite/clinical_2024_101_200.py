"""In-practice vignettes for CPRITE 2024 Q101–200.

Same shape as Q1–100: a resident-in-the-room scene, what they actually do
with the fact, and a one-line Bottom line. Kept tight so the stills have
one clear action to draw.
"""

CLINICAL: dict[int, str] = {
    101: (
        "A fellow designing a stimulant trial cannot recruit 80 kids. "
        "Stats: crossover — each child on drug and placebo — so 30 may power it. "
        "They plan a washout; they do not switch to parallel groups just to look cleaner. "
        "Bottom line: Crossover needs fewer participants because each child is their own control."
    ),
    102: (
        "A teen is panicking about tomorrow's race and has 'forgotten' to invite her mother. "
        "The resident lets her talk through the meet. "
        "They do not interpret the snub tonight. "
        "Bottom line: Following today's distress instead of the avoided conflict is supportive psychotherapy."
    ),
    103: (
        "Parents of a 14-month-old with social delay bring an MRI that says 'large brain.' "
        "The resident names the replicated finding: overgrowth by the end of year one, not a big brain at birth. "
        "No serial scans to 'watch the hippocampus shrink.' "
        "Bottom line: ASD's early MRI signature is accelerated brain growth in the first year."
    ),
    104: (
        "A sleepy teen with cataplexy is labeled narcolepsy type 1. "
        "The resident maps orexin cells in the lateral hypothalamus to LC, raphe, and LDT/PPT — the stay-awake network. "
        "Not an appetite circuit. "
        "Bottom line: Orexin to brainstem arousal nuclei keeps you awake."
    ),
    105: (
        "A parent of a toddler mostly issues commands: 'don't,' 'come here.' "
        "The resident coaches more 'because' talk — why the stove is hot, how the bus works. "
        "They are not asking the parent to babble more. "
        "Bottom line: Explanatory talk, not commands, pulls toddler language forward."
    ),
    106: (
        "A 10-year-old with ADHD, ODD, and explosive tantrums is referred 'for an antipsychotic.' "
        "The resident starts a stimulant and parent-management instead. "
        "Risperidone waits unless aggression stays dangerous after ADHD is treated. "
        "Bottom line: ADHD plus ODD still starts with a stimulant."
    ),
    107: (
        "A depressed teen says fluoxetine is pointless because weed is what actually helps. "
        "The resident reflects, 'You cannot imagine feeling good without smoking,' and waits. "
        "No lecture on hazards. "
        "Bottom line: Motivational interviewing's next line is a reflection, not a lecture."
    ),
    108: (
        "A 15-year-old misses two periods during exam season; pregnancy test is negative. "
        "The resident explains stress amenorrhea as hypothalamic GnRH turning down. "
        "Not the ovaries 'making more estrogen.' "
        "Bottom line: Psychogenic amenorrhea is impaired GnRH release."
    ),
    109: (
        "A teen has been sleeping 6 AM to 3 PM all summer; school starts in three weeks. "
        "The resident walks through chronotherapy: delay bedtime further each day until it lands on a school night. "
        "'Just go to bed earlier' will fail. "
        "Bottom line: Reset delayed sleep-phase by delaying around the clock, not by forcing an early bedtime."
    ),
    110: (
        "A first-grade boy with few words is already hitting when frustrated. "
        "The resident flags the language gap itself as a risk for later aggression and gets speech now. "
        "They do not wait on an ADHD workup to explain the hitting. "
        "Bottom line: Early verbal-language deficits are the neurocognitive finding most tied to aggression."
    ),
    111: (
        "Journal club: a trial is 'significant at p = 0.04.' "
        "The attending asks how big the benefit is. The resident looks for NNT, not the p value. "
        "Standard deviation is scatter, not size. "
        "Bottom line: NNT is the effect-size number clinicians can use."
    ),
    112: (
        "Derm sends a 15-year-old with facial sores who picks and plucks in a pocket mirror because he looks 'deformed.' "
        "The face is ordinary besides the sores. The resident diagnoses BDD, not primary skin-picking. "
        "ERP for the appearance belief, not just a Band-Aid. "
        "Bottom line: Picking to fix a 'deformed' normal face is BDD."
    ),
    113: (
        "A PAC invites the fellow to the capitol to talk about children's mental-health needs, not a numbered bill. "
        "The fellow goes: this is advocacy. "
        "A whip count would be lobbying. "
        "Bottom line: Awareness without a specific bill is advocacy."
    ),
    114: (
        "Prevention trial: 50% get depression untreated, 25% on drug. "
        "The resident writes ARR 0.25, NNT 4 — treat four high-risk kids to prevent one case. "
        "They do not quote the p value as the size. "
        "Bottom line: NNT = 1 / (50% − 25%) = 4."
    ),
    115: (
        "A maltreated teen's note mentions FKBP5 A/T. "
        "The resident remembers that allele plus early trauma breaks glucocorticoid-receptor feedback, so cortisol does not shut the HPA axis off. "
        "No clinical FKBP5 test to 'prove PTSD.' "
        "Bottom line: FKBP5 trauma risk works by interrupting cortisol's negative feedback."
    ),
    116: (
        "After a terminal brain-tumor talk, a 12th-grader wants a family trip to Europe for graduation. "
        "She is clear, not delirious, and can discuss dying. The resident reads this as normal adolescent meaning-making. "
        "They help plan the trip. "
        "Bottom line: A last big plan can be developmentally normal adolescent thinking."
    ),
    117: (
        "Intake: depression, fights at home, three years of cutting. "
        "The resident treats chronic NSSI as the strongest suicide-attempt predictor on that list and raises the safety plan. "
        "Low mood still matters; it does not outrank repeated self-injury. "
        "Bottom line: Chronic nonsuicidal self-injury is a high-voltage suicide marker."
    ),
    118: (
        "Anti-NMDA encephalitis: waxy flexibility, mute, staring. "
        "The resident starts lorazepam for catatonia while immunotherapy continues, and holds the antipsychotic. "
        "Bromocriptine is for NMS, not this. "
        "Bottom line: Autoimmune catatonia gets a benzodiazepine first."
    ),
    119: (
        "Afternoon double vision and droopy lids in a teenager. "
        "The resident thinks myasthenia and asks about thymic hyperplasia or thymoma. "
        "Not a thyroid nodule as the first gland. "
        "Bottom line: Fatigable ptosis/diplopia → the thymus."
    ),
    120: (
        "A 3½-year-old bilingual child has about ten words in each language and a few two-word phrases. "
        "The resident refers to SLP. Combined vocabulary this small is delay, not 'normal bilingual.' "
        "They also stop the family from using the child as interpreter. "
        "Bottom line: Combined vocabulary this small at 3½ is a language delay, bilingual or not."
    ),
    121: (
        "The clinic turns on PHQ-9s before every depression visit. "
        "A month later patients say they feel followed — enhanced experience, not fewer meds or fewer visits. "
        "The score is also what treat-to-target runs on. "
        "Bottom line: Measurement-based care's most consistent early win is the patient's experience."
    ),
    122: (
        "A teen with PMDD hates taking an SSRI all month. "
        "The resident explains the response is measured in days, so luteal-phase-only dosing is enough. "
        "Not cost, not withdrawal. "
        "Bottom line: PMDD SSRIs work fast enough for intermittent luteal dosing."
    ),
    123: (
        "A school wants 'the autism test.' "
        "The resident books ADOS with a developmental history. "
        "M-CHAT and SCQ are screens. "
        "Bottom line: Gold-standard ASD observation is the ADOS."
    ),
    124: (
        "A 17-year-old keeps using 'because the feelings stop.' "
        "The resident names negative reinforcement — taking away distress strengthens use. "
        "Craving from driving past a bar is cueing, not this. "
        "Bottom line: Using to relieve distress is negative reinforcement."
    ),
    125: (
        "A teen hides scabs along the hairline and cheeks. "
        "The resident knows the face is the most common excoriation site and looks there first. "
        "They still screen for BDD if appearance beliefs are driving it. "
        "Bottom line: Skin-picking disorder's favorite site is the face."
    ),
    126: (
        "New mood lability, a numb leg, and blurry vision. "
        "The resident asks MRI with FLAIR for demyelination. "
        "DWI would be the stroke-first sequence, not this. "
        "Bottom line: Suspected MS plaques show best on FLAIR."
    ),
    127: (
        "A 16-year-old whose father died will talk to two friends and goes quiet with mom. "
        "The resident tells the parent this is typical adolescent grief, not a family failure. "
        "They do not pathologize preferring peers. "
        "Bottom line: Teens often process loss with friends rather than parents."
    ),
    128: (
        "Parents of a 3-year-old want an ASD workup because bedtime must follow a script and he fears the dark. "
        "Daytime play is flexible, no repetitive behaviors. The resident calls it normal preschool. "
        "No autism pathway on bedtime rigidity alone. "
        "Bottom line: A strict bedtime ritual at three, with flexibility elsewhere, is typical."
    ),
    129: (
        "A moderately depressed 15-year-old needs therapy. "
        "The resident offers interpersonal therapy as the listed modality with the strongest AACAP evidence. "
        "Not PCIT, not brief psychoanalytic work. "
        "Bottom line: Among these choices, IPT has the most AACAP-cited evidence for youth MDD."
    ),
    130: (
        "Journal club on the serotonin-transporter short allele. "
        "The resident states the finding: short/short plus negative life events. "
        "Not parental depression by itself, and they will not genotype clinic patients off that paper. "
        "Bottom line: 5-HTTLPR short allele raised depression risk in the presence of negative life events."
    ),
    131: (
        "Parents describe night kicking and unrefreshing sleep. "
        "The resident orders PSG because periodic limb movement disorder is a lab diagnosis. "
        "They would not PSG a straightforward sleepwalker. "
        "Bottom line: PLMD requires polysomnography."
    ),
    132: (
        "OCD has failed two SSRIs. Someone suggests 'any TCA.' "
        "The resident picks clomipramine because it is the strongest serotonin-reuptake inhibitor in the class. "
        "Not because it blocks 5-HT receptors. "
        "Bottom line: Clomipramine's OCD edge is more potent 5-HT reuptake blockade."
    ),
    133: (
        "A 5-year-old with congenital HIV seizes after cognitive decline; CSF PCR is EBV-positive. "
        "The resident thinks primary CNS lymphoma. "
        "Not toxo, not HIV encephalopathy. "
        "Bottom line: HIV + EBV in CSF + new neuro decline = primary CNS lymphoma."
    ),
    134: (
        "Parents blame last year's methylphenidate for a 15-year-old below the 5th percentile, Tanner 2, delayed bone age, normal GH and thyroid. "
        "The growth chart has tracked low since early childhood. The resident calls constitutional delay and keeps the ADHD medicine. "
        "This is not a stimulant injury. "
        "Bottom line: Delayed bone age plus late puberty on a lifelong low curve is constitutional growth delay."
    ),
    135: (
        "A parent asks why their 1-year-old no longer 'hears' extra sounds in a language they do not speak at home. "
        "The resident names synaptic pruning — unused phoneme contrasts get cut after a universal 3-month start. "
        "This is expected, not hearing loss. "
        "Bottom line: Losing non-native speech sounds by 12 months is pruning."
    ),
    136: (
        "A SUD group titled 'relapse prevention' is listed under prevention. "
        "The resident files it as tertiary — the illness already happened; you are preventing the next episode. "
        "Universal school talks would be primary. "
        "Bottom line: Relapse prevention is tertiary prevention."
    ),
    137: (
        "A school report says a child 'dresses like the other gender.' "
        "The resident does not diagnose gender dysphoria without a persistent desire to be the other gender. "
        "Expression alone is not the criterion. "
        "Bottom line: Child gender dysphoria requires the desire to be another gender."
    ),
    138: (
        "A family cannot get therapy because the county carved it out of Medicaid. "
        "The resident names that as a structural constraint, not a 'cultural belief about therapy.' "
        "The note flags the policy, not the parents' values. "
        "Bottom line: Anthropology's policy-and-resources lens is structural."
    ),
    139: (
        "A parent wants clinical updates by ordinary SMS. "
        "The resident offers texts only for appointment times and moves diagnosis and dosing to the portal. "
        "That is the acceptable texting lane. "
        "Bottom line: Unsecured texts are for scheduling, not clinical content."
    ),
    140: (
        "The school replaces expulsion for use with a credited support group so the student stays enrolled. "
        "The resident calls that harm reduction, not rehabilitation. "
        "Keeping the kid in class is the harm being reduced. "
        "Bottom line: Stay-in-school instead of expel is harm reduction."
    ),
    141: (
        "On exam the neurologist brings a finger toward the patient's nose. "
        "The resident is watching accommodation — and convergence and miosis. "
        "They already did the swinging flashlight for RAPD. "
        "Bottom line: Finger-to-nose eye test = accommodation."
    ),
    142: (
        "A colleague missed a mandated report. "
        "Risk management calls it negligence — a negligent tort — not an intentional one like exploitation. "
        "The resident files the late report. "
        "Bottom line: Failure to report child abuse is negligence."
    ),
    143: (
        "The resident sets a vibrating fork on the midline of the forehead. "
        "Weber: cranial nerve VIII. "
        "Romberg with eyes closed is not the VIII test they want. "
        "Bottom line: Midline tuning fork tests CN VIII."
    ),
    144: (
        "A family is suing. The resident recites duty, negligence, causation, and harm. "
        "Intention would be a different kind of case. "
        "Bottom line: Malpractice needs duty, dereliction, direct cause, and damages."
    ),
    145: (
        "Two preschoolers: one saw a shooting on TV, one was in the room when a parent was assaulted. "
        "The resident treats direct experience of violence as the stronger externalizing predictor. "
        "Both get safety planning; the second gets the heavier aggression watch. "
        "Bottom line: Directly experiencing violence is the most robust environmental predictor of young-child externalizing."
    ),
    146: (
        "A 12-month-old looks at mother's face, gets a nod, then puts a hand in the sand. "
        "The resident writes social referencing. "
        "Not joint attention — they were not sharing the sandbox as a toy to show. "
        "Bottom line: Check-the-caregiver-then-act is social referencing."
    ),
    147: (
        "The resident needs a suicide question a shut-down 14-year-old might answer. "
        "They say, 'Some kids with depression think about suicide. Has that happened for you?' "
        "That is normalization, not a yes/no 'are you suicidal.' "
        "Bottom line: Name the symptom as something some kids have, then ask."
    ),
    148: (
        "A headline: 'Drug in pregnancy is four times more likely to cause a defect.' "
        "The resident translates that as relative risk and asks for the absolute numbers before counseling. "
        "Four times a tiny baseline is still tiny. "
        "Bottom line: 'Four times as likely' is relative risk."
    ),
    149: (
        "ADHD, café-au-lait spots, armpit freckles, and an optic glioma. "
        "The resident diagnoses NF1 and calls genetics and ophthalmology. "
        "Not TSC. "
        "Bottom line: Optic glioma + café-au-lait + axillary freckling = NF1."
    ),
    150: (
        "A 16-year-old meets borderline criteria. The team says 'wait until 18.' "
        "The resident names stigma, not an age-18 rule, as why people hesitate, and offers DBT-informed care now. "
        "DSM-5 allows the diagnosis in youth. "
        "Bottom line: Reluctance to diagnose adolescent BPD is mostly stigma."
    ),
    151: (
        "Genetics reports two cell lines in one child. "
        "The resident says mosaicism, not a premutation or a CNV. "
        "Counseling changes because tissues may not all carry the variant. "
        "Bottom line: Two cell types in one person = mosaicism."
    ),
    152: (
        "A 7-year-old stares and blinks; EEG is 3-Hz spike-and-wave. "
        "The resident calls childhood absence and, when asked inheritance, says autosomal dominant. "
        "Ethosuximide is next. "
        "Bottom line: 3-Hz absence epilepsy is autosomal dominant."
    ),
    153: (
        "The division wants a telepsychiatry clinic. "
        "The fellow flags unpaid infrastructure and overhead as the usual barrier. "
        "Not a missing national license; guidelines already exist. "
        "Bottom line: Telepsychiatry often stalls on unreimbursed infrastructure costs."
    ),
    154: (
        "A medically cleared overdose is boarding on pediatrics waiting for a psych bed. "
        "C/L writes a safety plan the floor can run tonight — 1:1, sharps, who to call. "
        "Not a promise of a faster transfer, not a PRN antipsychotic as the consult product. "
        "Bottom line: While they wait on peds, the consult's job is the safety plan."
    ),
    155: (
        "A delayed-puberty consult. "
        "The resident explains the switch is pulsatile GnRH from the hypothalamus, then LH/FSH. "
        "They do not start the story at estrogen. "
        "Bottom line: Puberty restarts with pulsatile GnRH."
    ),
    156: (
        "Someone asks how we know schizophrenia is 'genetic versus environmental.' "
        "The resident points to twin studies, not a karyotype. "
        "MZ versus DZ concordance is the pie chart. "
        "Bottom line: Twin studies split genetic from environmental contribution."
    ),
    157: (
        "A 4-year-old uses last week's bee sting to understand a new shot. "
        "The resident clocks that as preschool representational thought. "
        "It does not wait for middle childhood. "
        "Bottom line: Using a mental picture of a past event to understand a new one arrives in preschool."
    ),
    158: (
        "Parents say psychosis is 'the evil eye.' "
        "The resident records that as their causal attribution and works with it rather than arguing metaphysics. "
        "Meds and safety still proceed. "
        "Bottom line: 'The evil eye did this' is a causal attribution."
    ),
    159: (
        "An 8-year-old can pour water back and know it is the same amount. "
        "The resident names reversibility and concrete operations. "
        "They would not expect this in a preoperational 4-year-old. "
        "Bottom line: Reversibility is the concrete-operational hallmark."
    ),
    160: (
        "The court wants the treating psychiatrist to write a forensic report on the same youth. "
        "The resident declines: dual roles wreck the therapy. "
        "A separate evaluator can do the court work. "
        "Bottom line: Do not be both treater and forensic evaluator."
    ),
    161: (
        "An 8-year-old with ID/ASD is newly head-banging and screeching. "
        "Before clonidine or aripiprazole, the resident asks about teeth, ears, and constipation. "
        "A dental abscess would explain the week. "
        "Bottom line: New self-injury in a nonverbal child → look for pain, starting with dental."
    ),
    162: (
        "A community team writes a plan without the family in the room. "
        "The resident pulls the parents back in. "
        "Family participation in planning is the priority, not visit caps. "
        "Bottom line: Community systems of care put families on the planning team."
    ),
    163: (
        "A bruise plus a changing story. "
        "The resident has reasonable suspicion, not a courtroom proof, and reports. "
        "Waiting for photos or 'medical certainty' would be the error. "
        "Bottom line: Mandated reporting runs on reasonable suspicion."
    ),
    164: (
        "The resident is late, apologizes, and names how that might have felt — the same repair the child is practicing with siblings. "
        "That is modeling. "
        "Not an interpretation of transference. "
        "Bottom line: Doing the skill in the room is modeling."
    ),
    165: (
        "A case–control study asks mothers of ADHD kids what they drank in pregnancy. "
        "The resident flags recall bias before they believe the caffeine finding. "
        "Cohort attrition is a different problem. "
        "Bottom line: Looking backward at exposure in cases versus controls = recall bias."
    ),
    166: (
        "The hospital wants to 'go trauma-informed.' "
        "The resident's first step is teaching every employee — clerks included — to recognize trauma signs. "
        "Not certifying everyone in TF-CBT. "
        "Bottom line: Trauma-informed care starts with all staff recognizing trauma."
    ),
    167: (
        "A depressed, sleepless adolescent is sent for PSG. "
        "The resident expects more total REM, not a longer REM latency. "
        "They still treat the depression; the sleep study is not the therapy. "
        "Bottom line: Depression's PSG signature includes increased total REM sleep."
    ),
    168: (
        "A preschooler had a head injury. The team wants a prognosis for later behavior. "
        "The resident weights anterograde amnesia lasting more than a week over a few seconds of LOC. "
        "Rehab planning follows severity, not the ER's initial agitation. "
        "Bottom line: PTA longer than seven days is the lasting-sequelae marker."
    ),
    169: (
        "A lecture slide shows testosterone entering a neuron. "
        "The resident traces it to an intracellular receptor and a transcriptional cascade. "
        "Not a membrane second-messenger. "
        "Bottom line: Lipophilic hormones bind intracellular receptors."
    ),
    170: (
        "Parents of a child with myoclonic seizures ask when they can stop medicine. "
        "The resident says this type often needs lifelong treatment, unlike Rolandic or many absence epilepsies. "
        "False hope is the error. "
        "Bottom line: Myoclonic epilepsy is the one most likely to need lifelong treatment."
    ),
    171: (
        "After a child's session the parent asks for dating advice 'as my doctor.' "
        "The resident does not give it — that would create a doctor–patient relationship with the parent. "
        "Consenting for the child does not. "
        "Bottom line: Relationship advice to the parent in their own session makes them your patient."
    ),
    172: (
        "A 9-year-old with MDD is mostly somatic and irritable; a 16-year-old looks melancholic. "
        "The resident treats that age pattern as expected, not as two different diseases. "
        "Safety assessment is still the same. "
        "Bottom line: Melancholic symptoms are more common in adolescent than child MDD."
    ),
    173: (
        "A quiet 7-year-old will not answer 'how do you feel.' "
        "The resident asks which movie character they are most like. "
        "That projective door often opens when direct questions do not. "
        "Bottom line: 'Which character are you?' is a projective technique."
    ),
    174: (
        "Parents of a 5-year-old with ASD are pregnant and ask the recurrence number. "
        "The resident quotes about 2–10% unless a specific genetic diagnosis raises it. "
        "Not a Mendelian 50%. "
        "Bottom line: Sibling ASD recurrence after one affected child is on the order of 2–10%."
    ),
    175: (
        "An adolescent on clozapine has a falling ANC and also cannot sit still. "
        "The resident treats youth as more likely than adults to show akathisia on clozapine and still follows the neutropenia algorithm. "
        "They do not ignore the restlessness as 'just anxiety.' "
        "Bottom line: This exam keys akathisia as the clozapine side effect more likely in youth than adults."
    ),
    176: (
        "The same adolescent's restlessness is diagnosed as akathisia. "
        "Among mood stabilizers on the list, the resident uses lithium. "
        "Not valproate, not lamotrigine. "
        "Bottom line: Lithium is the listed agent used for clozapine-associated akathisia."
    ),
    177: (
        "Collaborative care: PHQ-9 still high on fluoxetine 20 mg plus weekly CBT. "
        "The consultant's first recommendation is to find out why — missed doses, residual trauma, wrong target. "
        "Not add bupropion and not jump to IOP. "
        "Bottom line: When collaborative-care numbers are stuck, explore why before switching."
    ),
    178: (
        "The same consultant scans the whole registry for kids whose PHQ-9 is not moving. "
        "That is population-based care, not just good manners toward one patient. "
        "The measurement itself is treat-to-target. "
        "Bottom line: Caseload review to find who is not improving is population-based care."
    ),
    179: (
        "A short, obese 10-year-old with rages, sleepiness, learning problems, ordering rituals, and skin picking. "
        "Before an MRI, the resident orders PSG: this is Prader–Willi until proven otherwise, and OSA is the sleep story. "
        "Genetics will confirm. "
        "Bottom line: PWS with hypersomnolence → polysomnography."
    ),
    180: (
        "Same child. Parents ask how you 'get' Prader–Willi. "
        "The resident says maternal uniparental disomy 15 — or a paternal 15q deletion; the exam keys maternal disomy. "
        "Not 22q, not a triplet repeat. "
        "Bottom line: PWS inheritance they want = maternal disomy of chromosome 15."
    ),
    181: (
        "A 16-year-old leaves the psych unit after a suicide attempt. "
        "The school piece of the transition plan is a named adult who checks in every day. "
        "Not a same-week IEP, not CBITS. "
        "Bottom line: School connectedness = one adult who checks in daily."
    ),
    182: (
        "The team starts fluoxetine. "
        "The resident's reason is the evidence base — TADS and after — not price and not 'the only FDA-approved SSRI.' Escitalopram is approved too. "
        "Safety planning still sits beside the prescription. "
        "Bottom line: Fluoxetine is first because the pediatric MDD data are strongest."
    ),
    183: (
        "Same admission: they need a therapy. "
        "The resident books CBT, the modality with the most youth-MDD data, often combined with the fluoxetine. "
        "DBT would wait for a chronic high-lethality self-injury picture. "
        "Bottom line: Best-supported psychotherapy for youth MDD is CBT."
    ),
    184: (
        "A child describes a funny smell, a wave of terror, and the world looking unfamiliar, then smacks her lips. "
        "The resident counts the first three as auras of a focal seizure; the lip smacking is ictal. "
        "EEG and MRI follow. "
        "Bottom line: Focal-seizure auras include jamais vu, fear, and olfactory hallucination — not automatisms."
    ),
    185: (
        "An adolescent looks borderline. Using AMPD, the resident checks identity, interpersonal function, and affective dysregulation. "
        "Cutting is associated, not one of the three core dimensions. "
        "They still treat the self-injury. "
        "Bottom line: AMPD borderline core = identity, social dysfunction, affective dysregulation."
    ),
    186: (
        "Pharmacogenetics: CYP2D6 poor metabolizer. "
        "The resident cuts expected doses of risperidone, aripiprazole, and perphenazine. "
        "Less worried about quetiapine or lurasidone on that pathway. "
        "Bottom line: 2D6 PM accumulates risperidone, perphenazine, and aripiprazole."
    ),
    187: (
        "A lecture asks for epigenetic mechanisms. "
        "The resident lists DNA methylation, histone marks, and noncoding RNA. "
        "Not a translocation or a base substitution — those change the sequence. "
        "Bottom line: Epigenetics = methylation, histone modification, noncoding RNA."
    ),
    188: (
        "Quality meeting. The resident recites IOM's six aims and fills in timely, efficient, and equitable beside safe, effective, and patient-centered. "
        "'Inexpensive' is not on the list. "
        "Bottom line: Crossing the Quality Chasm adds timely, efficient, and equitable."
    ),
    189: (
        "A newborn is 'slow to warm up.' "
        "The resident hears Chess and Thomas and names the other two clusters: easy and difficult. "
        "Not 'avoidant,' not 'hyperactive.' "
        "Bottom line: Chess and Thomas = easy, difficult, slow to warm up."
    ),
    190: (
        "Night facial twitches in a 9-year-old, EEG centrotemporal, otherwise well. "
        "The resident diagnoses benign Rolandic epilepsy: nocturnal, outgrown by puberty, and still warns that cognition can take a hit. "
        "They often hold meds. "
        "Bottom line: BRE is nocturnal and remits by puberty, but it is not always cognitively silent."
    ),
    191: (
        "Parent-management training is on the plan. "
        "The resident teaches ABC: what happens before, the identified behavior, and the consequence. "
        "Timeout is a technique, not the theory. "
        "Bottom line: Operant PMT = antecedent, behavior, consequence."
    ),
    192: (
        "A neuroscience slide on the salience network. "
        "The resident circles insula, anterior cingulate, and ventromedial PFC as the exam's three. "
        "Not the default-mode midline parietal nodes. "
        "Bottom line: Salience network on this exam = insula, ACC, vmPFC."
    ),
    193: (
        "Four preschoolers are playing jungle. "
        "The resident watches them negotiate roles, take each other's perspective, and remember the rules of the game. "
        "Reputation and formal moral reasoning are later. "
        "Bottom line: Shared pretend in preschool runs on negotiation, perspective-taking, and rules."
    ),
    194: (
        "Someone wants to call the nanny and the school without a release. "
        "The resident says HIPAA TPO covers the pediatrician, the outpatient psychiatrist getting the d/c summary, and the other treating therapist. "
        "Not the nanny, school, sibling, or parent's doctor. "
        "Bottom line: TPO is this patient's treaters, not collateral civilians."
    ),
    195: (
        "Genetics pimp session: name the X-linked set. "
        "The resident gives Lesch–Nyhan, Rett, and Fragile X — the keyed three. "
        "Gaucher and PKU stay autosomal recessive; they still know Rett is classically X-linked dominant. "
        "Bottom line: The X-linked trio this item wants is Lesch–Nyhan, Rett, and Fragile X."
    ),
    196: (
        "A teen watched the girls' locker room, stole shoes for arousal, and cross-dresses with sexual excitement. "
        "The resident lists voyeuristic, fetishistic, and transvestic disorders. "
        "Not pedophilia. "
        "Bottom line: Looking, fetish object, and aroused cross-dressing are three separate paraphilias."
    ),
    197: (
        "CYP2C19 two loss-of-function alleles. "
        "The resident lowers expected doses of citalopram, escitalopram, and sertraline. "
        "Less concerned about fluoxetine or nortriptyline on that pathway. "
        "Bottom line: 2C19 poor metabolizer → citalopram, escitalopram, sertraline."
    ),
    198: (
        "A child with tics is failing reading and washing hands raw. "
        "The resident screens ADHD, OCD, and learning disorder as the common Tourette comorbidities. "
        "Not bipolar or IED first. "
        "Bottom line: Tourette's usual psychiatric company is ADHD, OCD, and LD."
    ),
    199: (
        "A migraineur's psych review of systems. "
        "The resident specifically asks depression, panic, and mania-spectrum symptoms. "
        "They do not lead with hallucinations. "
        "Bottom line: Migraine psych comorbidity = depression, panic attacks, and mania."
    ),
    200: (
        "A low-BMI wrestler faints. "
        "The resident orders CBC, CMP, and ECG in the ED. "
        "Bone density and lipase wait. "
        "Bottom line: Restricting adolescent who syncope'd → CBC, CMP, ECG first."
    ),
}
