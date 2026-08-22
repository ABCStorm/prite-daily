"""In-practice vignettes for CPRITE 2023 Q51-100.

Resident-in-the-room scene, what they actually do with the fact, one-line Bottom line.
"""

CLINICAL: dict[int, str] = {
    51: (
        "A sleepy 14-year-old describes 'dreams while waking up'; last night's PSG already showed short REM latency. "
        "The resident books a multiple sleep latency test rather than a lumbar puncture. "
        "They do not order HLA typing or serum iron to 'confirm narcolepsy.' "
        "Bottom line: After a suggestive PSG, confirm narcolepsy with MSLT."
    ),
    52: (
        "A 9-year-old says 'I don't want to be in your parenting study'; mom has already signed. "
        "The resident thanks him, documents dissent, and does not enroll. "
        "They do not pull him aside to talk him into it or treat ODD as incapacity. "
        "Bottom line: A child's no to nontherapeutic research stops enrollment even if a parent consents."
    ),
    53: (
        "A school-age patient still spends hours lining up the bedroom after high-dose fluoxetine plus ERP. "
        "The resident adds risperidone as SSRI augmentation. "
        "They do not stack sertraline on fluoxetine or reach for valproate. "
        "Bottom line: Pediatric OCD partial response on SSRI plus ERP is classically risperidone-augmented."
    ),
    54: (
        "A fellow's note is thorough but the claim is bouncing. "
        "Billing walks through that the CPT code is the service actually delivered that visit, not the ICD diagnosis or the minutes on the clock. "
        "They recode the procedure, not the payer. "
        "Bottom line: CPT names the service; diagnosis lives in ICD."
    ),
    55: (
        "Parents want to know if a 14-year-old who has tried 'bi, then pan' labels will 'turn out gay or trans.' "
        "The resident says exploration of sexuality and identity is common and often fluid at this age, and the teen is otherwise doing well. "
        "They do not diagnose a personality problem or predict an adult identity. "
        "Bottom line: Changing orientation labels in a well-functioning teen is development, not pathology."
    ),
    56: (
        "Neurology starts carbamazepine for a teen with morning jerks and a JME EEG. "
        "The resident flags that carbamazepine can worsen myoclonus and asks about valproate or levetiracetam instead. "
        "They do not treat lamotrigine as the classic precipitant. "
        "Bottom line: Carbamazepine exacerbates myoclonus in JME."
    ),
    57: (
        "In clinic a 10-month-old looks at dad's face, then crawls toward a new toy. "
        "The resident names it social referencing, the same task as the visual cliff. "
        "They do not call it joint attention or object permanence. "
        "Bottom line: Using a caregiver's expression to decide whether to approach is social referencing."
    ),
    58: (
        "A clinic laptop is ransomware-locked after someone opened an email invoice. "
        "IT traces the disclosure to an employee accessing a malicious file, not to the cloud vendor or the paper-chart era. "
        "The resident reports the breach and skips the 'we need more IT staff' autopsy as the cause. "
        "Bottom line: The usual psychiatric data breach is a clicked malicious file."
    ),
    59: (
        "ED asks psych why a child suddenly has obsessions; the intern's first impulse is to consult. "
        "The attending asks what they read last night and sends them to the evidence, not to a new committee. "
        "Referral still happens, but that is care, not lifelong learning. "
        "Bottom line: Lifelong learning is reviewing the literature yourself."
    ),
    60: (
        "A school-age child laughs while describing sadness, speech comes in explosive bursts, and a brisk gag sets off coughing and tears. "
        "The resident calls pseudobulbar palsy and gets neurology, not conversion as the first label. "
        "They do not treat an absent-gag bulbar picture or start a myasthenia workup as the lead. "
        "Bottom line: Emotional incontinence plus a brisk gag is pseudobulbar, not bulbar, palsy."
    ),
    61: (
        "An 8-year-old can fill out a form about feeling sad; the resident hands over the Mood and Feelings Questionnaire. "
        "They do not use a PHQ-9 written for older youth or a mania or anxiety scale. "
        "The PSC stays in the waiting-room broadband stack. "
        "Bottom line: Self-report depression at age 8 is the Mood and Feelings Questionnaire."
    ),
    62: (
        "A 3-year-old hides after knocking a plant over and says 'I bad.' "
        "The resident tells the parents shame is developmentally on time now, not at six months. "
        "They do not wait until school age to expect self-conscious emotion. "
        "Bottom line: Capacity for shame is typically in place by age 3."
    ),
    63: (
        "The clinic EMR now banners any disruptive-behavior patient whose BMI has climbed two points. "
        "The medical director calls it continuous quality improvement, a live feedback loop. "
        "It is not a root-cause analysis and not a satisfaction survey. "
        "Bottom line: Chart flags that ping the team when BMI rises are CQI."
    ),
    64: (
        "Mom of an overweight 10-year-old whispers that Tanner 2 'is too young.' "
        "The resident shows the normal 8-13 thelarche window and does not start a CAH or tumor workup. "
        "Premature adrenarche would have been pubic hair before 8 without breasts. "
        "Bottom line: Tanner 2 at age 10 is normal puberty."
    ),
    65: (
        "Transplant wants a 'cleared for listing' letter on a teen who missed immunosuppressant doses. "
        "The resident names the bind: this eval is not pure beneficence; they also gatekeep a scarce organ. "
        "They do not pretend they are only the patient's advocate. "
        "Bottom line: Transplant eligibility puts beneficence in conflict with gatekeeping."
    ),
    66: (
        "A fellow asks why chronic stress 'shrinks memory.' "
        "The resident points to cortisol decreasing hippocampal neurogenesis, not oxytocin. "
        "They do not order a glucose or glutamate panel to explain it. "
        "Bottom line: Cortisol decreases hippocampal neurogenesis."
    ),
    67: (
        "A 13-year-old with severe weight loss denies purging but bolts to the bathroom after supervised meals. "
        "The resident adds a serum amylase rather than another phosphate. "
        "Calcium, lipids, and AST stay off the 'are they telling the truth' list. "
        "Bottom line: Covert vomiting is the amylase question."
    ),
    68: (
        "An 8-year-old in foster care after beatings says he will walk into traffic; voices call him 'no good,' yet he has friends at school. "
        "The resident keeps PTSD high and does not jump to a primary psychotic disorder. "
        "They do not lead with ODD or autism. "
        "Bottom line: Trauma plus derogatory voices in a socially able child is PTSD until you prove otherwise."
    ),
    69: (
        "Parents want a 'gaming addiction' label after credit-card sprees and a week of rage when the app is deleted. "
        "The resident first screens for a manic episode. "
        "Kleptomania and conduct disorder wait until mania is off the table. "
        "Bottom line: Rule out mania before calling spending-and-gaming an addictive disorder."
    ),
    70: (
        "A teen on a sedating antihistamine cannot stay awake in first period. "
        "The resident maps that to histamine H1 receptors that stabilize the sleep-wake cycle. "
        "They do not blame D2 or a beta-blocker as the arousal switch. "
        "Bottom line: H1 is the arousal/sleep-wake receptor on the list."
    ),
    71: (
        "A vice principal wants a 16-year-old back from juvenile detention to 'start over' on credits. "
        "The resident cites the JJDPA: facility coursework counts toward graduation. "
        "They do not agree to homebound-only or an automatic alternative school. "
        "Bottom line: Public school must count juvenile-facility credits toward a diploma."
    ),
    72: (
        "A child on a fifth foster placement shrugs off help: 'I do it myself.' "
        "The resident names compulsive self-reliance, not secure attachment. "
        "They do not praise it as maturity or expect high achievement as the typical pattern. "
        "Bottom line: Frequent foster moves commonly produce self-reliant kids who stop asking adults."
    ),
    73: (
        "On rounds a resident draws mPFC arrows down onto the amygdala. "
        "That reciprocal inhibition is how prefrontal control damps the stress response. "
        "They do not point at the pons or cerebellum for this job. "
        "Bottom line: Medial prefrontal cortex braking the amygdala decreases stress."
    ),
    74: (
        "Journal club: TMS versus sham, mean HAM-D at two weeks in two groups. "
        "The resident picks a t-test, not chi-square and not a mixed-factorial ANOVA. "
        "Logistic regression would have needed a yes/no outcome. "
        "Bottom line: Two groups, one continuous mean = t-test."
    ),
    75: (
        "A 12-year-old with terminal cancer says she will never drive; her 6-year-old roommate asks if grandma is waiting. "
        "The resident treats the driving line as a developmentally older grasp of a lost future. "
        "They do not equate it with magical reunion talk. "
        "Bottom line: Dying 12-year-olds mourn future selves; 6-year-olds stay with separation and magic."
    ),
    76: (
        "Parents bring a 14-month-old with social delay and an MRI that says 'large brain.' "
        "The resident names the replicated ASD pattern: average size at birth, then accelerated growth. "
        "They do not tell the family the brain was already big at delivery. "
        "Bottom line: ASD's first-year MRI signature is postnatal overgrowth after a normal birth size."
    ),
    77: (
        "An 8-year-old whose parents just separated draws dad, brother, and a tree, no mother. "
        "The resident says, 'Tell me about your drawing,' and waits. "
        "They do not point out the missing mother or praise the tree. "
        "Bottom line: A family drawing gets an open prompt, not an interpretation of who is absent."
    ),
    78: (
        "A 10-year-old has not slept in five days and is sure he is a superhero; family is loaded for bipolar. "
        "The resident starts risperidone for acute pediatric mania. "
        "Lithium waits: this child is under the age-12 label, and oxcarbazepine already failed a pediatric trial. "
        "Bottom line: Acute mania at age 10 is risperidone, not lithium."
    ),
    79: (
        "Parents wave a public-school 504 at a private academy that takes no federal money. "
        "The resident explains 504 binds recipients of federal funds, so the private school can refuse. "
        "They do not argue diagnosis or severity as the legal hook. "
        "Bottom line: A 504 plan applies only to schools that receive federal funds."
    ),
    80: (
        "Sleep studies on a collapsing teen are messy; CSF orexin comes back 90 pg/mL. "
        "The resident diagnoses narcolepsy rather than restless legs or a phase delay. "
        "They treat <110 pg/mL as the cutoff that settles an equivocal study. "
        "Bottom line: CSF orexin under 110 pg/mL means narcolepsy."
    ),
    81: (
        "A 9-month-old jabs a finger at the juice and looks at the preferred parent. "
        "The resident flags pointing to a desired object as the motor skill that builds social preference. "
        "They do not treat cooing or visual tracking as the item. "
        "Bottom line: Pointing to what they want, from about 7-9 months, is the motor root of social preference."
    ),
    82: (
        "A 16-year-old's MRI report mentions ongoing pruning and myelination. "
        "The resident translates that into better problem-solving, not better vocabulary or finer finger movements. "
        "Parents wanted a 'smarter at SAT words' story; that is not this curve. "
        "Bottom line: Pruning and myelination from 13 to 25 most improve problem-solving."
    ),
    83: (
        "In session the psychiatrist listens, names the feeling, and does not go fishing for childhood secrets. "
        "The resident labels it supportive therapy: empathy dosed to what the teen can bear. "
        "They do not call it IPT, DBT, or psychodynamic uncovering. "
        "Bottom line: Accurate empathy without archaeology is supportive psychotherapy."
    ),
    84: (
        "A 16-year-old crashes every luteal week; her hormone panel is textbook normal. "
        "The resident explains an abnormal brain response to ordinary hormone swings, not 'low estrogen.' "
        "They do not chase a high-progesterone story. "
        "Bottom line: Premenstrual mood symptoms are an abnormal response to normal hormones."
    ),
    85: (
        "A lithium-maintained teen hits 2.5 mEq/L after an OTC cold pack for a URI. "
        "The resident pulls naproxen off the med rec; acetaminophen would have been the safer fever drug. "
        "Guaifenesin and diphenhydramine are not the lithium-clearance problem. "
        "Bottom line: NSAIDs such as naproxen can push lithium into toxicity."
    ),
    86: (
        "The resident asks a quiet 7-year-old to draw a picture of themselves. "
        "That is the projective move; blocks and watching mom-child play are not. "
        "They do not start by 'clarifying objectives' with the parent as the projective task. "
        "Bottom line: 'Draw yourself' is a projective technique in the child interview."
    ),
    87: (
        "Risperidone has a teen galactorrhea; prolactin is 80. "
        "The resident sketches TIDA dopamine neurons holding prolactin down. "
        "They do not blame a GABA or serotonin 'prolactin nucleus.' "
        "Bottom line: Tuberoinfundibular dopamine tonically inhibits prolactin."
    ),
    88: (
        "A family's depression visits are capped at six while their asthma visits are not. "
        "The resident names the Mental Health Parity and Addiction Equity Act, not the ADA or the ACA, as the statute aimed at that double standard. "
        "They help the parents appeal on parity grounds. "
        "Bottom line: Unequal mental-health insurance rules are a parity-act problem."
    ),
    89: (
        "A 12-year-old has spent three days in a rigid pose, mute, unresponsive, afebrile, vitals normal. "
        "The resident gives lorazepam for catatonia and holds the antipsychotic. "
        "They do not start bromocriptine for NMS or cyproheptadine for serotonin syndrome. "
        "Bottom line: Acute pediatric catatonia gets lorazepam, not a neuroleptic."
    ),
    90: (
        "Oncology is worried about relapsed ALL but has not called it life-limiting. "
        "The resident asks the adolescent whether anyone has talked about their wishes if they got very sick. "
        "They do not wait for a clearer prognosis or leave it to the chaplain. "
        "Bottom line: Start advance care planning by asking the child what they already know and want."
    ),
    91: (
        "Pediatrics wants one waiting-room form that flags any psych risk, not just depression. "
        "The resident hands them the Pediatric Symptom Checklist, not a PHQ-9 or SCARED. "
        "McMaster stays for family-function visits. "
        "Bottom line: Primary-care broadband psych screen = Pediatric Symptom Checklist."
    ),
    92: (
        "After a missed soccer goal a third-grader says she is 'not good like the other kids.' "
        "The resident hears industry versus inferiority, not adolescent identity confusion. "
        "They coach the parent on competence, not on toddler shame. "
        "Bottom line: School-age 'I'm not as good as them' is industry vs inferiority."
    ),
    93: (
        "A guarded 17-year-old announces two months clean and waits to be grilled. "
        "The resident says, 'You must have put in lots of effort to stay away from drugs.' "
        "They do not open with which drugs or a lecture to keep going. "
        "Bottom line: Affirm the effort first; that is what engages."
    ),
    94: (
        "Week two of IPT for a depressed teen is a map of who matters, not a role-play yet. "
        "The resident completes an interpersonal inventory. "
        "Communication analysis and the mood thermometer wait for later or for CBT. "
        "Bottom line: Early IPT is a relationship inventory."
    ),
    95: (
        "Security footage shows a planned shove at a pharmacy counter so pills can be sold. "
        "The resident calls it instrumental aggression, not a reactive affective blow-up. "
        "They do not document it as impulsive self-defense. "
        "Bottom line: Robbery for profit is instrumental aggression."
    ),
    96: (
        "A 17-year-old, ashamed, describes six months of sexual fantasies about a 10-year-old neighbor and has not acted. "
        "The resident diagnoses pedophilic disorder because the fantasies are arousing, persistent, and distressing. "
        "They do not call enjoyable sexual arousal OCD, and they arrange appropriate safety and treatment. "
        "Bottom line: Distressing, persistent sexual arousal to a prepubescent child is pedophilic disorder."
    ),
    97: (
        "Journal club puts up Drug X versus placebo for teen anxiety: four studies and a pooled diamond. "
        "The resident sees the diamond just left of 1 with a CI that crosses the no-effect line and says there is no significant efficacy difference. "
        "They do not claim Drug X works 'a little' and they do not read the axis as adverse effects. "
        "Bottom line: If the overall diamond's CI includes 1, Drug X and placebo are not statistically different."
    ),
    98: (
        "A new paper says a childhood drug raises a rare side effect five-fold. "
        "The resident translates relative into absolute risk before the family panics. "
        "They do not lead with sensitivity or study-design jargon. "
        "Bottom line: A five-times relative increase of a rare event can still be a tiny absolute risk."
    ),
    99: (
        "A 5-year-old snores, snorts, grinds teeth, and melts down every afternoon. "
        "The resident orders overnight polysomnography for OSA, not a dental exam for the grinding. "
        "Actigraphy would have answered a schedule question, not apnea. "
        "Bottom line: Snoring plus daytime crankiness gets a PSG."
    ),
    100: (
        "A postpartum teen on fluoxetine 40 mg describes unwanted images of throwing the baby out a window and now avoids windows; she is not psychotic. "
        "The resident increases fluoxetine for OCD-range dosing rather than adding a neuroleptic. "
        "They do not switch or start a mood stabilizer. "
        "Bottom line: Ego-dystonic infant-harm thoughts without psychosis are postpartum OCD: push the SSRI."
    ),
}
