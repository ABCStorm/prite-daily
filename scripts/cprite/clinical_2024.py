"""In-practice vignettes for CPRITE 2024 Q1–100.

Same shape as the main PRITE bank: a resident-in-the-room scene, what they
actually do with the fact, and a one-line Bottom line.
"""

CLINICAL: dict[int, str] = {
    1: (
        "A mother of a 4-year-old calls the clinic asking for a 'wellness check' before preschool. "
        "The child is not yet symptomatic; she just wants help with sleep routines and social skills. "
        "The resident submits the visit and the claim comes back denied as not medically necessary. "
        "Therapy and med-management codes would have paid, but prevention itself is carved out. "
        "The resident documents the request, offers a brief parent-guidance visit under an allowed code if one exists, and flags the gap for the clinic manager. "
        "Bottom line: The usual barrier to preventive child mental health care is medical-necessity denial, not a ban on therapy or physician billing."
    ),
    2: (
        "A fellow is covering evening telehealth when a 16-year-old in another state asks for a stimulant refill. "
        "They have never met in person. Before e-prescribing a controlled substance, the resident checks whether a prior in-person exam exists. "
        "It does not, so the prescription waits until an in-person visit (or a qualifying public-health exception) can be arranged. "
        "Licensure, PDMP, and malpractice still matter, but they are not what Ryan Haight itself requires. "
        "Bottom line: Ryan Haight requires at least one in-person evaluation before tele-prescribing a controlled substance."
    ),
    3: (
        "In clinic, a lonely 15-year-old describes standing at a party, scrolling Instagram, thinking 'I'm so awkward.' "
        "The resident writes the thought on a whiteboard and asks what evidence supports or contradicts it. "
        "They do not soothe the feeling, interpret the party as transference, or start a distress-tolerance drill. "
        "The work is testing the cognition so the teen can try a different behavior next time. "
        "Bottom line: Identifying an automatic thought and examining the evidence is CBT."
    ),
    4: (
        "On a developmental consult, a 4-year-old peppered the resident with 'Why is the light on?' and 'How does the door work?' "
        "Parents worry the questions are 'too much.' The resident explains this is expected preschool language, not pathology. "
        "Two-word phrases and pointing-plus-a-word would have been toddler work; passive-voice grammar comes later. "
        "The visit becomes reassurance plus a language-rich home plan rather than a speech-delay workup. "
        "Bottom line: 'Why' and 'how' questions are the preschool language milestone."
    ),
    5: (
        "A teen in psychodynamic therapy for school refusal sits silent after a weekend with divorcing parents. "
        "The resident says, 'I wonder if staying home is a way of showing anger you can't say out loud. Is that possible?' "
        "That names a defense. Clarifying bellyaches, offering support, or making a transference comment about the therapist would be different moves. "
        "The interpretation is offered tentatively so the teen can take it or leave it. "
        "Bottom line: Defense interpretation links the symptom to the warded-off feeling."
    ),
    6: (
        "A consult resident reads a paper on maltreatment biology before seeing a foster teen with anxiety. "
        "They remember NR3C1 promoter hypermethylation changing glucocorticoid-receptor expression in the hippocampus, not the amygdala. "
        "The finding does not change today's SSRI choice, but it helps the team explain why early adversity can recalibrate stress systems. "
        "They avoid telling the family that a blood test will 'prove' trauma. "
        "Bottom line: Abuse-related NR3C1 methylation is classically studied in the hippocampus."
    ),
    7: (
        "Parents of an 8-year-old with contamination rituals say, 'He doesn't even think it's weird.' "
        "The resident notes poorer insight than in adult OCD and does not wait for the child to call the thoughts 'silly' before starting ERP. "
        "Pediatric OCD is at least as heritable, often better prognosis, and more common in boys before puberty. "
        "The family leaves with a plan that treats the rituals whether or not the child agrees they are excessive. "
        "Bottom line: Child OCD typically comes with less insight than adult OCD."
    ),
    8: (
        "A 9-year-old from a minority family tells the resident, 'Kids at school say people like me aren't smart.' "
        "The resident hears middle-childhood social comparison meeting the majority stereotype, not a sudden drop in ability. "
        "They ask how the family talks about identity, support bicultural competence, and involve the school counselor. "
        "Anti-bias posters are not the mechanism of harm; becoming aware of the majority view is. "
        "Bottom line: Stereotype internalization rises when children first grasp the majority view of their group."
    ),
    9: (
        "Intake: a 10-year-old wants friends but freezes at recess and loses every playdate. "
        "Mood is okay, home is calm, no undisclosed trauma. The resident recommends a social-skills group rather than individual CBT first. "
        "Group is the place to practice joining, losing, and repairing in real time. "
        "Severe family conflict, impulsive acting-out, or unprocessed abuse would have steered them elsewhere. "
        "Bottom line: Group therapy is first-line when the problem is making and keeping friends."
    ),
    10: (
        "A 15-year-old announces they are done with weekly therapy; parents want sessions to continue because of last year's running-away. "
        "The resident does not frame this as a confidentiality fight. The teen's assent has been withdrawn while parental consent remains. "
        "They convene a three-way conversation about risk, alternatives, and a time-limited trial of reduced frequency. "
        "AACAP's live issue here is assent and consent. "
        "Bottom line: When a minor wants out and parents want in, start with assent versus consent."
    ),
    11: (
        "Adoptive parents of a 10-month-old ask when to 'tell her.' "
        "The resident says begin in toddlerhood with simple language and keep revisiting as she can understand more — not a single sit-down at age 10. "
        "Waiting for the child to ask, or saving it for adolescence, turns adoption into a secret. "
        "They leave with a few age-right phrases and a plan to use the word 'adopted' the way other families use 'born.' "
        "Bottom line: Talk about adoption early and often; it is a conversation, not an event."
    ),
    12: (
        "In the playroom a 15-month-old looks at a toy, then at her mother, then back at the toy; when mother frowns at a loud noise, the toddler startles and crawls over. "
        "The resident marks joint attention and social referencing as the roots of empathy. "
        "This is not an IQ test and not an inhibited temperament. "
        "They tell the mother these everyday looks are the beginning of sharing another person's mind. "
        "Bottom line: Joint attention plus social referencing are precursors of empathy."
    ),
    13: (
        "ED: a 9-year-old explodes after a channel change, screams, kicks, and bites father. "
        "The resident calls it affective, reactive aggression — hot, impulsive, poorly planned — not a cold instrumental grab for a prize. "
        "Safety first, then a plan for frustration tolerance and parent coaching rather than a conduct-disorder script. "
        "Callous-unemotional traits would look different: planned, unemotional, goal-directed. "
        "Bottom line: Explosive, affect-laden, unplanned violence is affective aggression."
    ),
    14: (
        "A 7-year-old started seeing 'monster shadows' at night after the family dog died and now will only sleep in the parents' bed. "
        "The resident treats this as separation anxiety organized around loss, not PTSD from a qualifying trauma, not panic, not a simple phobia of dogs. "
        "They coach a gradual return to the child's room and name the grief without over-pathologizing. "
        "Bottom line: New nighttime fear plus needing to sleep with parents after a loss is often SAD."
    ),
    15: (
        "An 8-year-old referred for ADHD snores loudly and wets the bed most nights. "
        "The resident does not start a stimulant until sleep is addressed, and specifically asks about enuresis — OSA's frequent roommate. "
        "A sleep study and ENT referral may do more for attention than another dose increase. "
        "Seizures and migraine are not the typical pairing. "
        "Bottom line: Snoring plus inattention → ask about bedwetting and the airway."
    ),
    16: (
        "A preschool teacher has set out blocks and a story prompt, then steps back while a 4-year-old builds 'the zoo' with just enough help to keep going. "
        "The resident recognizes Vygotsky's zone of proximal development, not Piagetian conservation or Bandura. "
        "They coach parents to arrange the room so the child can do with help what they cannot yet do alone. "
        "Bottom line: Adult-crafted, child-led play is the zone of proximal development."
    ),
    17: (
        "A 13-year-old with autism is admitted for catatonia. High-dose lorazepam for a week has barely moved the Bush-Francis score. "
        "The resident pages ECT, not olanzapine. Adding a neuroleptic can worsen catatonia. "
        "They prepare the family for a time-sensitive conversation and hold off on 'give it another week.' "
        "Bottom line: Benzodiazepine-refractory catatonia goes to ECT, including in autistic youth."
    ),
    18: (
        "A 14-year-old is admitted for mania. The team wants an FDA-backed mood stabilizer for both the acute episode and maintenance. "
        "The resident chooses lithium — approved for youth 12 and older — rather than defaulting to valproate or lamotrigine. "
        "Labs, pregnancy counseling, and thyroid/renal monitoring are set up before the first dose. "
        "Bottom line: Lithium is the age-12+ FDA mood stabilizer for acute mania and maintenance."
    ),
    19: (
        "Clinic: six months of arguing, blaming, and annoying teachers. The resident diagnoses ODD and then screens ADHD before anything else. "
        "Most clinic ODD travels with ADHD; Tourette, OCD, and SAD are less common companions. "
        "The treatment plan pairs parent management with an ADHD workup rather than ODD-only therapy. "
        "Bottom line: New ODD → look for ADHD first."
    ),
    20: (
        "A 12-year-old has twice-monthly frontal headaches with photophobia and vomiting. Ibuprofen helps an attack but they keep coming. "
        "The resident starts propranolol for prevention and keeps triptans or antiemetics for the acute episode. "
        "They check asthma and resting pulse before writing the beta-blocker. "
        "Bottom line: Pediatric migraine prevention is propranolol (or a TCA/topiramate), not a daily triptan."
    ),
    21: (
        "A kindergarten teacher reports 'bofroom' for bathroom and 'pasgetti' for spaghetti. Meaning and grammar are fine; no stutter. "
        "The resident labels a speech-sound disorder and refers to speech therapy, not a language or pragmatic workup. "
        "Parents leave knowing this is about sounds, not intelligence. "
        "Bottom line: Wrong sounds with intact meaning is a speech-sound disorder."
    ),
    22: (
        "The school asks the consultant to review Positive Action, taught to every student with no risk screen. "
        "The resident files it as universal prevention and contrasts it with selective (a risk group) and indicated (already symptomatic) programs. "
        "Budget conversations get clearer once the tier is named. "
        "Bottom line: A whole-school program with no risk filter is universal prevention."
    ),
    23: (
        "A well-child visit family wants the 'best thing to prevent mental illness' — yoga, violin, vitamins, or treating mom's untreated depression. "
        "The resident is honest: treating parental psychopathology has the strongest child-prevention evidence. "
        "They offer mom a same-week intake and keep the lifestyle ideas as extras, not the main plan. "
        "Bottom line: Treat the parent's illness to prevent the child's."
    ),
    24: (
        "On pediatric neurology rounds someone asks which embryonic vesicle becomes cortex. "
        "The resident answers telencephalon and places diencephalon with thalamus, mesencephalon with midbrain. "
        "A quick sketch on the board keeps the consult team from mixing up the vesicles on the next board question — and the next MRI read. "
        "Bottom line: Cerebral cortex comes from telencephalon."
    ),
    25: (
        "Journal club: a community clinic wants to know if a parenting program 'works out there,' not just in a university lab. "
        "The resident asks whether the trial is effectiveness (usual-care, real-world) or efficacy (ideal, tightly selected). "
        "They stop the group from treating those words as synonyms. "
        "Bottom line: Efficacy asks if it can work; effectiveness asks if it does work in the wild."
    ),
    26: (
        "A 5-year-old boy has a year of worsening stair-climbing and running. EMG shows low-amplitude, short-duration motor-unit potentials. "
        "The resident thinks Duchenne, not MG, MS, or polio, and involves neuromuscular clinic and genetics. "
        "CK and a dystrophin workup follow; they do not start with an epilepsy protocol. "
        "Bottom line: Preschool proximal weakness plus a myopathic EMG is Duchenne until proven otherwise."
    ),
    27: (
        "An 11-year-old is withdrawn, irritable, and sometimes 'hears a whisper.' The team is split between early schizophrenia and severe anxiety. "
        "The resident listens for loose associations — formal thought disorder — which more specifically marks early-onset schizophrenia. "
        "Hallucinations and withdrawal occur in many non-psychotic childhood disorders. "
        "Bottom line: Looseness of associations helps separate early-onset schizophrenia from look-alike behavioral disorders."
    ),
    28: (
        "Behind the one-way mirror, a parent in PCIT says, 'You think the ice cream is yummy,' after the child pretends to lick a scoop. "
        "The coach marks Reflection, not Praise, Imitation, or Behavioral Description. "
        "The parent is learning to say the child's meaning back, not to evaluate or copy the play. "
        "Bottom line: PCIT reflection is repeating the child's words or meaning."
    ),
    29: (
        "A teen arrives with new personality change, tremor, and aggression. An uncle needed a liver transplant after a similar illness. "
        "The resident orders ceruloplasmin and slit-lamp exam for Wilson disease before assuming primary psychosis. "
        "Niemann–Pick and Huntington do not fit this age-plus-liver pedigree. "
        "Bottom line: New neuropsych plus a liver-transplant relative is Wilson until cleared."
    ),
    30: (
        "A father reads the note, disagrees with the ADHD diagnosis, and asks that it be deleted. "
        "The resident keeps the clinical impression and adds a sentence that the family disagrees. "
        "They do not euphemize, code-hide, or write a formulation with no diagnosis. "
        "Bottom line: Keep the diagnosis and explicitly document the family's dissent."
    ),
    31: (
        "A research meeting: the fellow wants to t-test every EEG time point between groups. "
        "The resident stops the plan — that is a type I error factory — and asks for a multiple-comparison correction or a cluster test. "
        "Power calculations address misses, not false positives. "
        "Bottom line: Many tests require a multiple-comparisons correction."
    ),
    32: (
        "On the ward the resident asks a child to stand, close their eyes, and hold their arms out, then gives a light push. "
        "They are testing joint-position sense, not core strength or following commands. "
        "A sway with eyes closed that steadies with eyes open points to proprioception. "
        "Bottom line: Eyes-closed stance plus a light push assesses joint-position sense."
    ),
    33: (
        "A protocol wants to measure amygdala activity in youth with conduct disorder. "
        "The resident picks fMRI, not CT, DTI, or a nuclear study as first choice. "
        "Structure and tracts will not answer an activity question. "
        "Bottom line: Functional amygdala questions are fMRI questions."
    ),
    34: (
        "A multi-site child-psychosis genetics meeting is genotyping thousands of SNPs in cases versus controls. "
        "The resident names it a GWAS, not WES, linkage, or FISH. "
        "They help the team explain to families that this finds common frequency differences, not a single-gene diagnosis. "
        "Bottom line: Lots of SNPs times case–control is a GWAS."
    ),
    35: (
        "In genetics clinic a fellow asks what pedigree analysis is actually for. "
        "The resident describes mapping familial — including quantitative — trait loci through family structure, not hunting common variants in mixed populations (that is GWAS). "
        "They sketch a three-generation tree on the whiteboard to show the method. "
        "Bottom line: Pedigrees map familial, including quantitative, trait loci."
    ),
    36: (
        "A teen with panic says their body is 'broken.' The resident explains fight-or-flight as a useful alarm that is misfiring. "
        "That is an adaptive formulation, not a neurotransmitter lecture or a list of DSM criteria. "
        "The teen leaves with a less catastrophic story about their own physiology. "
        "Bottom line: 'Your alarm is trying to keep you safe' is an adaptive model of anxiety."
    ),
    37: (
        "Parents want a timeout script for a 10-year-old. The resident picks one or two target behaviors, a dull spot (not the toy-filled bedroom), no spanking, and no running commentary. "
        "A kitchen timer that ends whether or not the child is calm can reward the tantrum. "
        "They role-play one timeout in the office so the parents feel the difference. "
        "Bottom line: Timeout works when it is brief, boring, and reserved for one or two behaviors."
    ),
    38: (
        "After a crash, a teen says they felt calm, lost time, and watched themselves from above the car. "
        "The resident names depersonalization, not derealization, hallucination, or fugue. "
        "They normalize it as a peritraumatic response and screen for evolving PTSD without overcalling psychosis. "
        "Bottom line: An out-of-body view of oneself during trauma is depersonalization."
    ),
    39: (
        "A 13-year-old with intellectual disability and a history of infantile spasms has a new thickened plaque on the lower back. "
        "The resident recognizes a shagreen patch and thinks tuberous sclerosis, not a port-wine Sturge–Weber stain or café-au-lait NF1. "
        "Dermatology and genetics join the team; they do not shrug it off as eczema. "
        "Bottom line: ID, early seizures, and a shagreen patch point to tuberous sclerosis."
    ),
    40: (
        "Parents of a 13-year-old who just came out ask for therapy 'to make him straight.' "
        "The resident says clearly that orientation-change efforts do not work and can harm, and offers family support instead. "
        "Age, family participation, and 'depth' of therapy do not make conversion work legitimate. "
        "Bottom line: Do not offer or endorse reparative therapy."
    ),
    41: (
        "ED: two days of nonsense speech and thought broadcasting plus a malar rash. "
        "The resident treats this as neuropsychiatric lupus and starts steroids, not aspirin or a first jump to cyclophosphamide. "
        "Rheumatology is called while the safety hold is written. "
        "Bottom line: New psychosis plus a butterfly rash → steroids for lupus cerebritis."
    ),
    42: (
        "A 14-year-old calmly describes stealing bikes to sell them and feels no rush or rage. "
        "The resident tags proactive, planned aggression and thinks conduct disorder, not bipolar irritability or anxious lashing-out. "
        "The treatment plan emphasizes accountability and contingencies, not only a mood stabilizer. "
        "Bottom line: Cold, goal-directed aggression is the conduct-disorder signature."
    ),
    43: (
        "An 11-year-old who has avoided teams asks about cross-country. The parent says sports matter and asks whether the child would enjoy it. "
        "The resident hears warmth plus reasoning — authoritative parenting — not a decree and not a shrug. "
        "They reinforce the style rather than prescribing a sport. "
        "Bottom line: Warm, firm, and discussing it is authoritative parenting."
    ),
    44: (
        "A severely underweight adolescent is admitted and refeeding starts. The resident puts phosphate on the twice-daily lab list. "
        "Sodium and creatinine matter, but hypophosphatemia is the classic lethal refeeding shift. "
        "Nursing has standing orders to call for a falling phos. "
        "Bottom line: During refeeding, watch phosphate."
    ),
    45: (
        "A teen started aripiprazole, then paced the ED in misery. Someone gave a pill; now their asthma is worse. "
        "The resident recognizes propranolol for akathisia — and its beta-blockade in the lungs. "
        "They switch the akathisia plan and treat the wheeze; benztropine would have been the wrong first guess. "
        "Bottom line: Akathisia plus new wheeze usually means someone gave propranolol."
    ),
    46: (
        "A physically well preschooler has a year of bedtime stalling, night wakings, and early rising, only around sleep. "
        "Daytime behavior is fine. The resident diagnoses insomnia disorder, not ODD or ADHD. "
        "The plan is a consistent bedtime routine and a return-to-bed protocol, not a stimulant trial. "
        "Bottom line: Isolated chronic bedtime battles are pediatric insomnia, not oppositionality."
    ),
    47: (
        "CPS takes custody of a 6-month-old after the mother tests positive for methamphetamine again. "
        "The resident names parens patriae — the state acting as parent — not police power or courtroom privilege. "
        "The note explains the legal frame to the team without editorializing about the mother. "
        "Bottom line: CPS removal for neglect is parens patriae."
    ),
    48: (
        "A fellow claims their school-based anxiety study will generalize everywhere. "
        "The resident asks what threatens external validity — including whether subjects change over the study window so the finding will not hold later. "
        "They separate that from internal-validity threats like testing and regression to the mean. "
        "Bottom line: External validity asks whether the result will still be true elsewhere and later."
    ),
    49: (
        "First session with a 16-year-old who drinks most weekends. The resident does not lecture, recruit peers, or hand parents a consequence chart. "
        "They explore the teen's own stance toward alcohol — curiosity, pride, worry — and leave the door open. "
        "Education and skills come after ambivalence is on the table. "
        "Bottom line: Early adolescent AUD work starts with the teen's attitude toward use."
    ),
    50: (
        "A socially anxious teen says they wish they were not too afraid to go to a party and spend every weekend alone. "
        "Among the usual SAD cognitions, the resident hears loneliness as the suicide flag and does a careful safety assessment. "
        "Fear of stuttering or a costume regret would not have triggered the same urgency. "
        "Bottom line: In social anxiety, isolation is the suicide red flag."
    ),
    51: (
        "A child who choked now panics at any solid food. The therapist teaches relaxation, then builds a hierarchy from puree toward toast. "
        "The resident names counterconditioning — pairing calm with the old fear cue — not shaping or extinction alone. "
        "Parents stop force-feeding and follow the hierarchy. "
        "Bottom line: Relaxation plus a food hierarchy is counterconditioning."
    ),
    52: (
        "A 12-year-old in the middle of a custody fight whispers, 'Will the judge hear what I say in here?' "
        "The resident names privilege — the legal shield on treatment communications — and explains its limits honestly. "
        "Duty, competence, and parens patriae are different problems. "
        "Bottom line: 'Will court hear my session?' is a privilege question."
    ),
    53: (
        "Hospice parents of a 17-year-old say their child is withdrawn and angry. They ask whether to keep quiet about dying. "
        "The resident recommends including the teen in decisions about their death, not distraction or automatic antidepressants. "
        "Silence is not kindness here. "
        "Bottom line: A dying adolescent should be in the decision-making, not protected from it."
    ),
    54: (
        "Parents ask if their 3-year-old will remember a car crash. "
        "The resident explains that later verbal memory of the event tracks the language the child had to encode it, more than IQ or how scared they looked. "
        "They still treat the family's distress and watch for new fears. "
        "Bottom line: Early declarative memory of an event depends on language at the time."
    ),
    55: (
        "A resident learning AIMS asks what they must actually look at. "
        "The attending has them watch the tongue at rest — the classic tardive target — not tandem gait or visual fields. "
        "The exam becomes a 10-minute habit after every antipsychotic visit. "
        "Bottom line: AIMS includes examining the tongue at rest."
    ),
    56: (
        "A biracial 15-year-old says, 'I don't fit in anywhere.' "
        "The resident does not assign a multiethnic identity or send the decision to a family session. "
        "They treat identity as a personal choice that can be made and remade, and sit with the in-between. "
        "Bottom line: Cultural identity is chosen and re-chosen; do not pick it for the teen."
    ),
    57: (
        "The hospital forbids lobbying. A legislator's aide asks the child psychiatrist what boarding in the ED looks like. "
        "The resident answers with professional knowledge and does not ask for a yes vote on a bill. "
        "Education is allowed; asking for a specific appropriation is not. "
        "Bottom line: Answering a lawmaker's factual question is education, not lobbying."
    ),
    58: (
        "A fellow preparing for court asks whether the 14-year-old will get a jury. "
        "The resident cites McKeiver: juveniles have no constitutional jury right, but they do have counsel, due process, and proof beyond a reasonable doubt. "
        "The team stops promising the family a jury trial. "
        "Bottom line: Juvenile court does not guarantee a jury."
    ),
    59: (
        "In play therapy a child makes the resident act the scared kid while the child plays the adult. "
        "The resident names turning passive into active — doing what was once endured. "
        "They stay in the play rather than interpreting it as projective identification. "
        "Bottom line: Role reversal in play is turning passive into active."
    ),
    60: (
        "A 17-year-old with opioid use is in mild withdrawal in clinic. The resident starts buprenorphine now, not after a week of abstinence. "
        "Naltrexone would require being off opioids; methadone is more restricted. "
        "COWS is documented and the first dose is observed. "
        "Bottom line: Start buprenorphine when the adolescent is in withdrawal."
    ),
    61: (
        "Journal club mentions GRM3 / mGluR3. The resident ties it to psychosis risk, not anxiety or ASD. "
        "They use it as a teaching hook, not a clinical test they can order this afternoon. "
        "Bottom line: GRM3 variants are a consistent GWAS signal for psychotic disorders."
    ),
    62: (
        "On the playground two 4-year-olds ride push cars side by side, each calling their own parent, barely interacting. "
        "The resident tells the worried teacher this is parallel play, typical preschool, not a social-deficit diagnosis. "
        "Cooperative play with shared goals comes later. "
        "Bottom line: Next to each other, not with each other, is parallel play."
    ),
    63: (
        "A fellow notes earlier motor milestones in some traditional African caregiving systems. "
        "The resident attributes the difference to deliberate teaching and practice, not nutrition or 'more stimulation' in the Western sense. "
        "The consult becomes a conversation about what caregivers already do, not a deficit story. "
        "Bottom line: Motor timing is trained, not only maturational."
    ),
    64: (
        "A grand-rounds slide on the Grant Study asks what in childhood predicted later flourishing. "
        "The resident answers warm relationships, not IQ, looks, or elite SES, and uses that to justify time spent on the parent–child relationship in clinic. "
        "Bottom line: Warm childhood relationships beat status and smarts for later adaptation."
    ),
    65: (
        "Two weeks after a house fire, a child in the ICU is irritable, screams 'get me out,' and thrashes from sleep, but stays alert and attentive. "
        "The resident diagnoses acute stress disorder, not delirium (attention would fluctuate) and not PTSD (too soon). "
        "They start trauma-informed support and do not start an antipsychotic for 'ICU psychosis.' "
        "Bottom line: Attentive plus a post-trauma cluster at two weeks is ASD, not delirium."
    ),
    66: (
        "A student asks what usually happens after CPS removes a child. "
        "The resident says reunification with parents is the most common final outcome, then kinship, then adoption. "
        "The team plans for visits and a reunification-informed treatment frame rather than assuming adoption. "
        "Bottom line: Most removed children go home."
    ),
    67: (
        "A 9-year-old became depressed after a year of virtual school and a hard return to the building. "
        "The resident thinks industry versus inferiority — competency — and asks about homework, teams, and feeling 'behind.' "
        "Fidelity is an adolescent Erikson task; this is still grade school. "
        "Bottom line: School-age depression after disrupted school → assess competency."
    ),
    68: (
        "A youth stopped daily cannabis a week ago and now has insomnia, headaches, low mood, and restlessness. "
        "The resident recognizes cannabis withdrawal, not opioid or alcohol withdrawal, and offers sleep support rather than a benzo taper. "
        "The timeline — about a week — is part of the diagnosis. "
        "Bottom line: Irritable, sleepless, and headachy at day seven is cannabis withdrawal."
    ),
    69: (
        "A child with epilepsy is referred for 'behavior.' The resident screens ADHD before depression or FND. "
        "ADHD is the most common psychiatric comorbidity of pediatric epilepsy. "
        "The note tells neurology why a Vanderbilt is in the packet. "
        "Bottom line: Child with epilepsy → screen ADHD."
    ),
    70: (
        "Parents in a high-crime neighborhood keep a tight curfew; a colleague calls it 'too controlling.' "
        "The resident notes that restrictive parenting can be protective when the street is dangerous, even if it is a liability in a safer suburb. "
        "They do not automatically pathologize monitoring. "
        "Bottom line: Strict parenting can be adaptive in a high-crime neighborhood."
    ),
    71: (
        "After a fall, the team argues MRI versus CT. The question is a possible skull fracture. "
        "The resident picks CT for bone; MRI would have been for white matter, infarct, or CSF flow. "
        "The scanner choice matches the tissue. "
        "Bottom line: Bone questions go to CT."
    ),
    72: (
        "A 5-year-old melts down whenever an adult says no, at home and school. "
        "The resident starts parent–child interaction therapy, not child-only CBT or play therapy as first-line. "
        "The parents become the agents of change in the room. "
        "Bottom line: Young ODD is a parent–child interaction therapy problem."
    ),
    73: (
        "Parents grill a teen every night about where they were. The resident has them drop the questions if the teen makes curfew. "
        "That removes an aversive stimulus when the desired behavior happens — negative reinforcement. "
        "It is not punishment and not a sticker chart. "
        "Bottom line: Stop nagging when they are on time = negative reinforcement."
    ),
    74: (
        "Quetiapine helped a teen's psychosis but the scale is up 12 kg. "
        "The resident switches to aripiprazole rather than to olanzapine or adding valproate. "
        "Weight is tracked weekly through the cross-taper. "
        "Bottom line: Antipsychotic weight gain in youth — switch to aripiprazole."
    ),
    75: (
        "TEAM study discussion: risperidone worked differently in kids who also had ADHD. "
        "The resident calls ADHD a moderator — a baseline variable that changes the size of the treatment effect — not a mere covariate. "
        "The journal club finally uses the word correctly. "
        "Bottom line: 'It worked differently if they had ADHD' means moderator."
    ),
    76: (
        "A child with tics starts habit reversal. The first homework is noticing the urge and the tic, not yet the competing response. "
        "The resident names awareness training as step one. "
        "Parents stop saying 'stop that' and start helping the child catch the premonitory feeling. "
        "Bottom line: Habit reversal begins with awareness training."
    ),
    77: (
        "A child with developmental delay and a possible deletion syndrome needs a first-line genetic test. "
        "The resident orders chromosomal microarray for large deletions and duplications, not Sanger or a targeted PCR. "
        "The family is counseled that CMA looks at copy number, not every letter of the code. "
        "Bottom line: Big deletions and duplications are a microarray question."
    ),
    78: (
        "A 4-year-old with severe hyperactivity has already been expelled from daycares and behavior therapy has not been enough. "
        "The resident starts methylphenidate — the preschool evidence base — not risperidone or imipramine. "
        "Blood pressure, appetite, and sleep are on the follow-up template. "
        "Bottom line: Failed-behavior preschool ADHD still starts with methylphenidate."
    ),
    79: (
        "A family starts a bell-and-pad alarm. The resident explains that the alarm is the unconditioned stimulus; after pairing, a full bladder becomes the conditioned stimulus that wakes the child. "
        "Wet sheets are not the CS. Parents stop blaming laziness. "
        "Bottom line: In alarm training, sensing a full bladder is the conditioned stimulus."
    ),
    80: (
        "A subpoena arrives for an adolescent's chart. There is no waiver and no court order. "
        "Counsel says appear, assert privilege, and answer only if the judge directs you. "
        "The resident does not mail the record or ignore the subpoena. "
        "Bottom line: A subpoena is not authorization; show up and wait for the judge."
    ),
    81: (
        "A new mother with her own abuse history hears the baby cry and says, 'She doesn't feel loved.' "
        "The resident hears a reenactment of the mother's story onto the infant, not rapprochement or splitting. "
        "Dyadic work starts with helping her notice the cry as a signal, not a verdict. "
        "Bottom line: Past abuse scripted onto the infant is reenactment."
    ),
    82: (
        "A child who did well with a second-grade reading IEP is sinking in fifth grade, refusing homework. "
        "The resident asks about written expression — the output demand that explodes in later elementary — not another phonics drill. "
        "A new psychoeducational look at writing is ordered. "
        "Bottom line: Late-elementary crash after a reading IEP → think written expression."
    ),
    83: (
        "An 8-year-old is newly irritable, sleepy in class, and a restless loud snorer. "
        "The resident orders overnight polysomnography, not a sleep diary as the gold standard. "
        "MSLT can wait until breathing is cleared. "
        "Bottom line: Snoring plus school problems → overnight PSG."
    ),
    84: (
        "A parent asks if their child's rocking is a tic. The movements are rhythmic, start young, and the child looks soothed. "
        "The resident calls them stereotypies. Tics are more suppressible and less comforting. "
        "The plan is not habit reversal first. "
        "Bottom line: If the movement soothes, think stereotypy, not tic."
    ),
    85: (
        "After a natural disaster the team screens the whole class. The resident keeps extra concern for the child whose caregiver is the source of physical abuse. "
        "Interpersonal trauma by a caregiver carries more PTSD risk than a storm, a crash, or the news. "
        "Bottom line: The highest pediatric PTSD risk is abuse by the person who should protect you."
    ),
    86: (
        "A preschool reports a 4-year-old touching a classmate's genitals. "
        "The resident treats this as outside typical curiosity — unlike touching one's own body in the bath or peeking at a parent dressing — and opens a careful sexual-behavior assessment. "
        "The interview stays non-leading. "
        "Bottom line: Peer genital touching at four is not normative curiosity."
    ),
    87: (
        "An infant who just started a new food is floppy, constipated, feeding poorly, with dilated pupils. "
        "The resident thinks infant botulism and asks for EMG, not a head ultrasound, while holding honey-history questions. "
        "Neurology and public health are called. "
        "Bottom line: Floppy baby after a new food → EMG for botulism."
    ),
    88: (
        "A pediatrician refers a student from the school where the psychiatrist is also the consultant. "
        "The resident names the dual role and the fidelity problem — loyalty split between patient and school — before accepting both hats. "
        "They disclose, set boundaries, or decline one role. "
        "Bottom line: Two hats is a fidelity / conflict-of-interest problem."
    ),
    89: (
        "A 7-year-old eats five foods, gags at textures, and is falling off the growth curve, with no fear of fatness. "
        "The resident diagnoses ARFID driven by sensory aversion, not anorexia. "
        "The plan is a feeding team, not an eating-disorder body-image group. "
        "Bottom line: Extreme picky eating without weight/shape fear is ARFID."
    ),
    90: (
        "Journal club: suicidal ideation 3% on drug, 2% on placebo. The resident computes NNH = 1 / 0.01 = 100. "
        "They write it on the board so the room sees absolute risk, not a scary relative number. "
        "Bottom line: NNH is 1 divided by the absolute risk increase."
    ),
    91: (
        "A 15-year-old with cancer wants to stop a painful treatment. The ethics team asks about age of consent. "
        "The resident redirects to developmental understanding — can this adolescent grasp the decision — not a birthday. "
        "The conversation becomes a capacity exam, not a statute lookup. "
        "Bottom line: A child's end-of-life capacity tracks understanding, not chronological age."
    ),
    92: (
        "A 16-year-old on a mood stabilizer presents with headache, stiff neck, and fever. LP: normal pressure, lymphocytes, no bug. "
        "The resident names lamotrigine aseptic meningitis and holds the drug. "
        "Lithium and valproate do not look like this. "
        "Bottom line: Aseptic meningitis on a mood stabilizer → think lamotrigine."
    ),
    93: (
        "The clinic wants measurement-based care. Front-desk time, patient privacy worries, and one attending's 'I just know' are listed. "
        "The resident flags EMR integration as the organizational-level barrier — getting scores into the chart — not the patient-level ones. "
        "IT, not a pep talk, is the next meeting. "
        "Bottom line: The clinic-level MBC barrier is getting scores into the EMR."
    ),
    94: (
        "An EEG tech asks where the posterior alpha rhythm is paced. "
        "The resident answers thalamus, not pons or cerebellum, and uses it to explain why drowsy posterior rhythm changes. "
        "Bottom line: The alpha pacemaker is thalamic."
    ),
    95: (
        "Hospital day 3 of meningococcal meningitis, an adolescent is intermittently irritable, tearful, and poor in eye contact, waxing and waning, exam otherwise unchanged. "
        "The resident diagnoses delirium, not adjustment disorder or a TIA. "
        "They check meds, sleep, and infection before calling psychiatry for 'new depression.' "
        "Bottom line: Fluctuating mental status in a sick hospitalized teen is delirium."
    ),
    96: (
        "Parents of a 7-year-old girl who still wets the bed want to know whose fault the strict potty training was. "
        "Dad wet the bed until 10. The resident names paternal history as the strongest risk factor, not sex, early training, or old separation anxiety. "
        "Blame leaves the room; an alarm or desmopressin plan enters. "
        "Bottom line: Enuresis runs in families; training style is not the main cause."
    ),
    97: (
        "On exam a child has a stiff, velocity-dependent catch in the legs. "
        "The resident calls it spasticity — an upper-motor-neuron sign — not hypotonia or fasciculations. "
        "The consult note points neurology at a central, not a nerve, problem. "
        "Bottom line: Spasticity is an upper-motor-neuron sign."
    ),
    98: (
        "A medically ill adolescent in supportive therapy treats the resident like a beloved dead grandparent. "
        "The resident uses the warmth to give encouragement and practical advice rather than interpreting the transference or chasing dreams. "
        "Neutrality is for uncovering work, not this frame. "
        "Bottom line: Supportive therapy uses a positive transference; it does not interpret it."
    ),
    99: (
        "A 13-year-old has been irritable and unfocused for two months since the divorce announcement, but is not sad and has no sleep, appetite, or school drop. "
        "The resident diagnoses adjustment disorder because neurovegetative symptoms are absent — not because there is a stressor (MDD can have one too). "
        "Irritable mood can count for child MDD; the missing vegetative cluster is what decides it. "
        "Bottom line: No vegetative symptoms → adjustment, not major depression."
    ),
    100: (
        "An 8-year-old with disruption and failing grades is sent to the school psychologist. "
        "The resident expects psychoeducational testing — IQ, achievement, processing — not OT sensory strategies or the social worker's family liaison role. "
        "The IEP meeting will run on those numbers. "
        "Bottom line: The school psychologist's distinctive job is psychoeducational testing."
    ),
}
