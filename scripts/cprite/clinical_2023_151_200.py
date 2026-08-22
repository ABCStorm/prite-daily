"""In-practice vignettes for CPRITE 2023 Q151–200.

Resident-in-the-room scene, what they actually do with the fact, one-line Bottom line.
"""

CLINICAL: dict[int, str] = {
    151: (
        "A teen with migraine and panic wants 'something besides another pill.' "
        "The resident books biofeedback: she watches her heart rate and skin temperature and gets rewarded for bringing them down. "
        "They do not sell it as hypnosis, TMS, or EMDR. "
        "Bottom line: Biofeedback is operant conditioning of the autonomic nervous system."
    ),
    152: (
        "Parents ask whether fish-oil pills can help their child's depression. "
        "The resident says the proposed mechanism is turning down inflammatory cytokines, not acting like an SSRI. "
        "They still start an evidence-based antidepressant if the depression is moderate-severe. "
        "Bottom line: Omega-3s are keyed as anti-cytokine, not as a serotonin drug."
    ),
    153: (
        "A 14-year-old will not make friends, avoids eye contact, melts down when the schedule changes, and lectures on the solar system. "
        "The resident diagnoses autism spectrum disorder, not social anxiety or pragmatic communication disorder. "
        "They do not call the rule-focus OCD. "
        "Bottom line: Missed social cues plus rigidity and a special interest is ASD."
    ),
    154: (
        "A school-age child has seizures, lost language, and is bouncing off the walls. "
        "The resident orders EEG with sleep and is looking for continuous spike-and-wave, not a 3-4 Hz absence burst. "
        "They do not wait on another 'behavior' referral. "
        "Bottom line: Language regression plus seizures --> check for CSWS/Landau-Kleffner."
    ),
    155: (
        "A trans-identified teen at Tanner 2 is already in gender-affirming therapy with family support. "
        "The resident's first medical step is a GnRH agonist to pause puberty, not estrogen/testosterone and not surgery. "
        "Spironolactone waits for a later feminizing regimen. "
        "Bottom line: Tanner 2 medical start is puberty blockade, not cross-sex hormones."
    ),
    156: (
        "After one lunchroom fight a child says, 'Nobody wants to be my friend anymore.' "
        "The resident names overgeneralization and has the child list friends who were not in the fight. "
        "They do not treat it as catastrophizing or 'it's all my fault.' "
        "Bottom line: One event stretched to always/everyone is overgeneralization."
    ),
    157: (
        "Parents of a defiant 9-year-old want the therapist to 'make him listen.' "
        "The resident frames family therapy as rebuilding a warm, mutually respectful relationship so limits can stick. "
        "They do not take over discipline or stop at a handout on ODD. "
        "Bottom line: ODD family work is warmth-plus-respect between parent and child, not the therapist as cop."
    ),
    158: (
        "A week after risperidone, a teen cannot stay in the chair and says his legs have to move. "
        "The resident diagnoses akathisia and starts propranolol. "
        "Benztropine is for dystonia; they do not add a stimulant. "
        "Bottom line: New restlessness on an antipsychotic gets propranolol first."
    ),
    159: (
        "A caregiver worries that a 30-month-old plays beside another toddler and shows blocks to the adult instead of handing them over. "
        "The resident reassures: that is parallel play, which is normal at this age. "
        "No autism workup for failed sharing at 2.5 years. "
        "Bottom line: Side-by-side play at 30 months is expected, not a disorder."
    ),
    160: (
        "A student presents a depressed teen and never asked about mania. "
        "The resident's first One-Minute Preceptor line is, 'What is your DSM diagnosis?' -- get a commitment -- before naming the missed bipolar screen. "
        "They do not open with 'you forgot mania' or 'how do you think that went.' "
        "Bottom line: Precept by making the learner commit, then probe."
    ),
    161: (
        "Parents of a 13-year-old with new conduct-disorder behaviors ask if he is 'going to be a criminal forever.' "
        "The resident says most youth with CD improve a lot by young adulthood; a minority persist. "
        "They do not promise a pill will erase it or predict prison. "
        "Bottom line: Most conduct disorder does not become lifetime antisocial personality."
    ),
    162: (
        "A fifth-grader is crumbling after a string of failing grades and benchwarming. "
        "The resident targets a sense of competence -- industry versus inferiority -- as the emotional engine of this age. "
        "They do not lecture on object permanence or formal operations. "
        "Bottom line: Ages 5-12 grow emotionally through feeling able to do things well."
    ),
    163: (
        "A lawyer retains the resident to evaluate a child for court. "
        "The resident writes the report to the court, not as the child's treating doctor, and explains the limits of confidentiality up front. "
        "They do not open a therapy chart. "
        "Bottom line: In a forensic eval the client is the court, not the child."
    ),
    164: (
        "A parent demands the therapist's process notes for a school hearing. "
        "The resident explains HIPAA treats psychotherapy notes as a special category that needs extra consent, unlike the ordinary chart. "
        "They release a treatment summary, not the process notes, without proper authorization. "
        "Bottom line: Psychotherapy notes have a HIPAA lock the rest of the record does not."
    ),
    165: (
        "A rural pediatrician calls about a depressed 11-year-old and cannot get a child-psych appointment for four months. "
        "The resident picks up through the state's Child Psychiatry Access line and coaches meds and safety by phone. "
        "They are not booking themselves into the school or the pediatric clinic. "
        "Bottom line: CPAP is the pediatrician consulting child psychiatry by phone or e-consult."
    ),
    166: (
        "A teen with cannabis use disorder has been sober six months. "
        "The resident says, 'It is wonderful that you have been sober for six months,' and stops -- that is an affirmation. "
        "They do not pile on a lecture or a summary of every slip. "
        "Bottom line: Naming a specific patient strength is motivational interviewing's affirmation."
    ),
    167: (
        "After a student suicide, the principal asks the resident to 'come be our psychiatrist.' "
        "The resident stays in the consultant role: advise administration on messaging, memorials, and contagion. "
        "They do not prescribe, run grief groups, or evaluate staff as patients. "
        "Bottom line: School consultant after a suicide advises the system; they do not treat the building."
    ),
    168: (
        "Genetics pimps Prader-Willi versus Angelman. "
        "The resident says imprinting silences the maternal or paternal copy of the same 15q genes. "
        "Not a triplet-repeat expansion and not 'the gene got louder over generations.' "
        "Bottom line: Imprinting = one parent's allele is turned off."
    ),
    169: (
        "A loner teen talks vaguely about superpowers and looks fearful. "
        "The resident asks whether social anxiety eases with familiar people; if it does not, that supports schizotypal. "
        "Frank delusions would move the diagnosis toward psychosis, not personality. "
        "Bottom line: Schizotypal social anxiety does not melt with familiarity."
    ),
    170: (
        "On a neuro screen for ADHD, the resident watches rapid pronation-supination and finger taps. "
        "Overflow and sloppy alternating movements are the soft sign they expect. "
        "They do not chase a snout reflex or Gowers sign. "
        "Bottom line: ADHD's classic soft sign is trouble with repetitive motor tasks."
    ),
    171: (
        "A fellow wants outcomes data on a rare genetic syndrome and has 18 clinic patients. "
        "Stats says case-control -- sample the rare cases and compare them with controls -- rather than waiting on a huge cohort or an RCT. "
        "They do not run a one-time cross-sectional survey and call it longitudinal. "
        "Bottom line: Rare disease on this exam is a case-control design."
    ),
    172: (
        "Parents refuse a stimulant because a cousin 'got tics on Ritalin.' "
        "The resident cites the 2015 meta-analysis: new or worse tics were no more common on stimulant than on placebo. "
        "They still watch, but they do not withhold ADHD treatment for that fear. "
        "Bottom line: Controlled trials do not show stimulants causing tics."
    ),
    173: (
        "A family with Fragile X keeps getting more severely affected kids in later generations. "
        "The resident names anticipation -- the triplet repeat expanded. "
        "Not imprinting, not mosaicism. "
        "Bottom line: Worse disease down the family tree from a growing repeat is anticipation."
    ),
    174: (
        "A three-year-old watches the doll move from bed to shelf and says the first child will look on the shelf. "
        "The resident tells the parents that is a failed false-belief task -- theory of mind is still immature, not a lie. "
        "They do not diagnose ASD from this item alone. "
        "Bottom line: Most three-year-olds have not yet got theory of mind."
    ),
    175: (
        "An 8-year-old sees gory pictures of family dying that 'pop in' all day and checks that everyone is safe. "
        "A minor car crash a year ago is in the history; the resident still diagnoses OCD, not PTSD or a hallucination. "
        "ERP, not an antipsychotic. "
        "Bottom line: Intrusive harm images plus checking are obsessions, not trauma flashbacks."
    ),
    176: (
        "A teen has been cutting for two years and now mentions a passing death wish. "
        "The resident treats chronic NSSI as the strongest listed predictor of a future attempt and tightens safety planning. "
        "They do not wave it off as 'just coping.' "
        "Bottom line: Repeated self-injury is a suicide-attempt marker."
    ),
    177: (
        "A history-of-the-field lecture asks why child guidance clinics were built. "
        "The resident answers juvenile delinquency -- Healy, the courts, and the early clinics -- not poverty or later deinstitutionalization. "
        "They do not rewrite it as a child-abuse movement. "
        "Bottom line: Child guidance started with delinquent youth."
    ),
    178: (
        "Parents want a 1:1 psychotherapist written into the IEP because 'IDEA says so.' "
        "The resident says IDEA guarantees FAPE in the least restrictive environment, not a psychiatrist, PMT, or private therapy. "
        "They still help the family request appropriate services. "
        "Bottom line: IDEA's second promise is the least restrictive environment."
    ),
    179: (
        "A 7-year-old with encopresis is also arguing, blaming, and defying at home. "
        "The resident screens ODD as the comorbidity this item wants, not GAD. "
        "They treat the constipation and the oppositionality together. "
        "Bottom line: Soiling's most listed psychiatric roommate is ODD."
    ),
    180: (
        "Parents of a heavy-using 17-year-old say, 'He'll be fine if he quits before college.' "
        "The resident cites NLSY trajectories: early-heavy-quitters looked a lot like persistent heavy users in adult roles. "
        "They do not promise that stopping now fully erases the adolescent-use hit. "
        "Bottom line: Heavy teen marijuana use scars adult transitions even if they quit early."
    ),
    181: (
        "Neuroscience rounds: what keeps toddler synapses alive? "
        "The resident names BDNF -- synaptogenesis up, apoptosis down -- not leptin or orexin. "
        "They do not order a BDNF blood level. "
        "Bottom line: Toddler brain-building peptide is BDNF."
    ),
    182: (
        "A 17-year-old on a new antipsychotic hits the ED hot, tachycardic, dry, and in rhabdo. "
        "The resident keeps NMS on the list and also treats for MDMA intoxication. "
        "They do not call this alcohol, heroin, or GHB. "
        "Bottom line: Party-drug mimic of NMS is MDMA."
    ),
    183: (
        "Retained in a suit against a school after alleged coach abuse, the resident examines the child. "
        "The forensic question they answer is damages -- what harm occurred -- not whether the school had a duty or is liable. "
        "They do not write a verdict. "
        "Bottom line: The child expert in the lawsuit speaks to damages."
    ),
    184: (
        "Journal club: pediatric antidepressant NNT is 9. "
        "The resident translates: treat nine kids, one extra responder is from the drug; the rest of the improvement would have happened on placebo too. "
        "They do not say 'only one in nine gets better at all.' "
        "Bottom line: NNT 9 means one drug-attributable win per nine treated."
    ),
    185: (
        "A saliva screen: 85 true positives, 15 false negatives, 99 true negatives, 1 false positive. "
        "The resident computes sensitivity 85/100 = 85%, not the 99% specificity. "
        "They do not mix it up with PPV. "
        "Bottom line: Sensitivity is true positives over everyone who has the disease."
    ),
    186: (
        "A 9-year-old has breast buds; parents fear precocious puberty because 'Tanner said eleven.' "
        "The resident cites current US data: girls typically start puberty at 8-10. "
        "Workup if it is truly early, rapid, or otherwise red-flag, not because she is 9. "
        "Bottom line: Median thelarche in US girls is now 8-10 years."
    ),
    187: (
        "A newly resettled teen is isolated in a high-ranked school and doomscrolls news from home. "
        "The resident's protective-factor target is several close friends, not faster assimilation or a better ranking. "
        "They help the school connect him to peers. "
        "Bottom line: Refugee youth mental health tracks close friendships more than school prestige."
    ),
    188: (
        "ED: an autistic, nonverbal child with GI problems is escalating, already on morning aripiprazole and BID guanfacine; words are not working. "
        "The resident gives extra oral aripiprazole, drops the lights and noise, and treats constipation/reflux. "
        "They do not lead with IM lorazepam or olanzapine, send the caregivers out, or make the plan 'just admit psych.' "
        "Bottom line: ASD agitation -- extra PO of the home antipsychotic, less stimulation, fix the belly."
    ),
    189: (
        "An adolescent already has a year of mood swings, impulsivity, and cutting. "
        "The resident asks three more: chronic emptiness, panic about abandonment, and brief dissociation under stress. "
        "They do not need entitlement, exploitation, or trauma flashbacks to make borderline. "
        "Bottom line: Emptiness plus abandonment fear plus transient dissociation complete the BPD picture."
    ),
    190: (
        "C/L: depressed teen with liver failure needs an antidepressant. "
        "The resident picks citalopram, escitalopram, or fluvoxamine. "
        "They skip duloxetine, nefazodone, amitriptyline, bupropion, and trazodone. "
        "Bottom line: Lowest listed hepatotoxicity is citalopram, escitalopram, fluvoxamine."
    ),
    191: (
        "A 10-year-old with contamination OCD is starting CBT. "
        "The resident builds a graded exposure ladder, has the child nickname the thought, and practices talking back to OCD. "
        "They do not pivot to attachment work, psychodrama, or 'just accept the feeling' as the protocol. "
        "Bottom line: Pediatric OCD therapy is expose, rename, and boss back."
    ),
    192: (
        "A 2-year-old pretends a block is a phone, copies a tantrum she saw yesterday, and solves a puzzle without dumping every piece first. "
        "The resident marks symbolic play, deferred imitation, and internal problem-solving as the 18-36 month social-cognitive burst. "
        "They do not expect conservation or identity consolidation. "
        "Bottom line: 18-36 months is pretend, copy-later, and think-then-act."
    ),
    193: (
        "Follow-up after a moderate-severe TBI at age 7: the child hunts for words, has lost some skills, and is falling further behind each grade. "
        "The resident expects word-finding trouble, skill loss, and a slower learning rate -- not adult aphasia or trauma flashbacks. "
        "School services get rebuilt around new learning speed, not around a one-time IQ. "
        "Bottom line: Pediatric TBI late effects are anomia, lost skills, and slowed learning."
    ),
    194: (
        "Parents want an IEP because their 7-year-old with ADHD cannot read. "
        "The resident's letter documents that vision is cleared, high-quality reading interventions already failed, and emotion is not the main cause. "
        "They do not hang the request on low IQ, ELL status, or a 'bad school.' "
        "Bottom line: SLD/IEP ask = eyes OK, feelings not the driver, and good reading help already failed."
    ),
    195: (
        "A 9-year-old has chronic irritable mood and explosive tantrums. "
        "The resident will not stack DMDD with bipolar, IED, or ODD; ADHD and MDD can still go on the list. "
        "They pick one of the overlapping disruptive diagnoses, not all of them. "
        "Bottom line: DMDD cannot be diagnosed with bipolar, IED, or ODD."
    ),
    196: (
        "Parents want a number on phones and mood. "
        "The resident says more social media time tracks depression in a dose-dependent way, nasty online experiences worsen mood, and problematic use pairs with social anxiety and rejection sensitivity. "
        "They do not sell likes as self-esteem therapy or promise that positive posts cancel the risk. "
        "Bottom line: More time, worse interactions, and rejection-sensitive use go with worse mental health."
    ),
    197: (
        "A slide of the brain at rest. "
        "The resident circles medial prefrontal cortex, posterior cingulate, and medial posterior parietal/precuneus as default mode. "
        "They leave insula/ACC (salience) and DLPFC (executive) off that trio. "
        "Bottom line: DMN hubs here are mPFC, PCC, and medial parietal cortex."
    ),
    198: (
        "A 4-year-old sits bolt upright, screams, sweats, and has a racing heart; she does not remember it in the morning. "
        "The resident's top three are sleep terrors, nocturnal epilepsy, and panic. "
        "They do not lead with sleepwalking, narcolepsy, or a circadian disorder. "
        "Bottom line: Night scream plus autonomic storm -- terrors, seizure, or panic."
    ),
    199: (
        "Admission labs on a restricting adolescent come back with high cholesterol, high cortisol, and bumping LFTs. "
        "The resident treats those as expected in anorexia, not as a reason to stop looking at the low potassium and the bradycardia. "
        "They do not expect a high WBC or high T4. "
        "Bottom line: Anorexia can raise cortisol, cholesterol, and liver enzymes."
    ),
    200: (
        "After IM medication and physical holds on the unit, the resident follows Joint Commission: staff stay eyes-on the whole time, the holds come off the moment the child is calm, and then they debrief with the patient. "
        "No 15-minute minimum, no automatic seclusion or 24-hour isolation afterward. "
        "They do not add a mandatory antihistamine as a Joint Commission step. "
        "Bottom line: Restraints -- continuous watch, release when calm, debrief."
    ),
}
