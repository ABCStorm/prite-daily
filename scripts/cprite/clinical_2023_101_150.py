"""In-practice vignettes for CPRITE 2023 Q101–150.

Resident-in-the-room scene, what they actually do with the fact, one-line Bottom line.
"""

CLINICAL: dict[int, str] = {
    101: (
        "A ninth-grader cannot make first period and sleeps until noon on Saturday. "
        "The resident names delayed sleep-phase, starts a sleep diary, and plans morning light. "
        "They do not order a PSG for a late but consolidated night, and they do not call it narcolepsy. "
        "Bottom line: Hard school mornings plus weekend sleep-ins is a circadian phase delay."
    ),
    102: (
        "Journal club on animal conflict. A fellow argues that the meanest males keep the species alive. "
        "The attending redirects: sociobiology counts copies of genes, so reproduction is the endpoint. "
        "Aggression and resource-holding only matter if they get offspring raised. "
        "Bottom line: Species survival is reproduction, not who wins the fight."
    ),
    103: (
        "Monday: a staff photo with a patient from Friday's school play is on Instagram, captioned about 'improvement.' "
        "The psychiatrist has the post taken down that morning. "
        "Family notification and HR can wait until the picture is gone; this is not 'supportive social media.' "
        "Bottom line: Unauthorized patient photo online — take it down first."
    ),
    104: (
        "A high-octane five-year-old is bowling peers over at recess. Mom signs him up for soccer and plays rule-bound physical games at home. "
        "The resident names Thomas and Chess activity, not intensity or distractibility. "
        "They back the channeling instead of starting a med for 'too much energy.' "
        "Bottom line: Channel high motor energy; that temperament trait is activity."
    ),
    105: (
        "A student says adult neurogenesis is 'the olfactory bulb, like rats.' "
        "The resident corrects: in humans the dentate gyrus of the hippocampus is the site the boards want. "
        "They do not quote rodent olfactory data as the human answer. "
        "Bottom line: Postnatal human neurogenesis is hippocampal, not olfactory."
    ),
    106: (
        "Peds admits a boy for 'conversion falls.' He Gowers up from the floor and reports muscle pain. "
        "The resident asks for CK and EMG, not another brain MRI. "
        "A normal EMG would have left conversion on the table; this exam will not be normal. "
        "Bottom line: Proximal, painful weakness that looks functional still needs an EMG."
    ),
    107: (
        "Parents ask why their reasonable 14-year-old becomes unglued over a text. "
        "The resident draws two clocks: limbic alarm on time, prefrontal brake still late. "
        "They do not tell the family the amygdala is 'delayed.' "
        "Bottom line: Teen emotion dysregulation is a late PFC, not a late limbic system."
    ),
    108: (
        "A 12-year-old has spent two years sliding into voices, flat affect, and odd laughing; medical workup is clean. "
        "The resident diagnoses early-onset schizophrenia, not new autism or DMDD. "
        "They start an antipsychotic and a school plan, not a mood-stabilizer-first bipolar path. "
        "Bottom line: Childhood progressive psychosis plus negatives is early-onset schizophrenia."
    ),
    109: (
        "Sleep lab calls about a sleepy teen. "
        "The resident looks for sleep-onset REM, not 'long N2' or extra slow-wave sleep. "
        "If SOREMPs are there after the overnight PSG, they treat narcolepsy. "
        "Bottom line: Narcolepsy on the tracing is REM as you fall asleep."
    ),
    110: (
        "At a surprise party, a five-year-old hides under a table in full view of the door so uncle 'won't see her.' "
        "The resident labels Piagetian egocentrism and reassures the parents this is preschool, not sneaking. "
        "They do not test conservation or object permanence over a party hide. "
        "Bottom line: If I can't see you, you can't see me is egocentrism."
    ),
    111: (
        "A child with FASD comes in for 'behavior.' "
        "The resident screens ADHD first — the most common psychiatric comorbidity — before leading with ODD or IED. "
        "Stimulant and school supports are on the table the same day. "
        "Bottom line: FASD's usual psychiatric roommate is ADHD."
    ),
    112: (
        "A 13-year-old with a thick chart is referred into the community system of care. "
        "The resident asks who the case manager is, because CASSP lives on coordination, not on a faster residential bed. "
        "They do not threaten discharge for missed appointments. "
        "Bottom line: CASSP's working principle is case management, not residential-first care."
    ),
    113: (
        "A child has waves of vertigo, occipital headache, and a limp that is gone by the next day; neuro exam is now normal. "
        "The resident treats this as basilar-artery migraine, not conversion and not tension headache. "
        "They do not wait for confusion to call it a migraine equivalent. "
        "Bottom line: Occipital headache plus transient brainstem/focal signs is basilar migraine."
    ),
    114: (
        "Journal club: 'the study was underpowered.' "
        "The resident translates: they had too little chance of a true positive (1 minus beta). "
        "They do not confuse power with 'avoiding a false positive' or with a 95% CI. "
        "Bottom line: Power is the chance of catching a real effect."
    ),
    115: (
        "Parents of a teen with risperidone gynecomastia want to sue. The chart shows the side effect was discussed before the start. "
        "Risk management: standard of care was met; a note is evidence of that, not a magic shield. "
        "They do not argue that gynecomastia 'doesn't count' as harm. "
        "Bottom line: Malpractice fails when care met the standard, not because someone wrote a paragraph."
    ),
    116: (
        "Parents cannot describe when their child actually sleeps. "
        "The resident issues a watch actigraph and a two-week diary. "
        "They save PSG for apnea or narcolepsy, not for 'what time is bedtime at home.' "
        "Bottom line: Typical home sleep pattern is actigraphy plus a diary."
    ),
    117: (
        "A teen is in REM five minutes after lights-out and sleeps in class. "
        "The resident names low orexin/hypocretin and sends CSF or a narcolepsy panel, not a leptin level. "
        "Appetite peptides are the wrong axis. "
        "Bottom line: Sleep-onset REM plus hypersomnolence means orexin is down."
    ),
    118: (
        "A manic 16-year-old will not eat or drink, heart rate dips below 50, and every antipsychotic has caused dystonia. "
        "The resident books ECT that week, not another oral mood stabilizer the patient will not swallow. "
        "TMS and ketamine are not the rescue. "
        "Bottom line: Life-threatening, medication-intolerant mania goes to ECT."
    ),
    119: (
        "Eight months of abdominal pain, negative workup, three sports, 'never shows stress.' "
        "The resident treats coping style — stuffing affect — as the main somatic-symptom risk, not being 10 or male or athletic. "
        "They start CBT for somatization rather than another scope. "
        "Bottom line: The kid who never shows stress is the one who somatizes."
    ),
    120: (
        "Early-onset psychosis plus a narrow face and a heart murmur. "
        "The resident orders 22q11.2 deletion testing, not a CAG-repeat or methylation panel. "
        "Genetic counseling is in the same referral. "
        "Bottom line: Velocardiofacial psychosis risk is a gene deletion."
    ),
    121: (
        "Time-out during math ends the worksheet; tantrums around homework then multiply. "
        "The resident names escape: the time-out negatively reinforced the outburst. "
        "They keep the demand in place and reinforce starting the problem, instead of more chair time. "
        "Bottom line: Time-out that lets a child escape work is negative reinforcement."
    ),
    122: (
        "A city board asks psychiatry what 'universal mental-health prevention' looks like. "
        "The resident talks parks, housing, and street design — urban planning — not an at-risk conduct group. "
        "FEP psychoeducation and motel vouchers are indicated, not universal. "
        "Bottom line: Universal SDH work is community design, not a clinic for identified kids."
    ),
    123: (
        "A family arrives quoting a TikTok about 'chemical imbalance.' "
        "The resident knows that is where most Americans get mental-health news, and corrects the content without mocking the source. "
        "They do not assume the pediatrician or an advocacy site already taught this. "
        "Bottom line: The public's psychiatrist is the news and the internet."
    ),
    124: (
        "Sixth admission for unexplained abdominal pain; family wants 'one more scan' and no psychiatrist until medicine is done. "
        "The resident consults psychiatry now, on the medical floor, while the workup continues. "
        "They do not discharge with only an outpatient psych card. "
        "Bottom line: AACAP timing is concurrent medical workup plus psych consult, not sequential."
    ),
    125: (
        "Family therapy is stuck. The psychiatrist tells them to have one argument a day on purpose. "
        "That paradox is strategic, not structural (no seating chart) and not solution-focused (not hunting exceptions). "
        "They watch whether prescribing the fight takes the heat out of it. "
        "Bottom line: 'Please keep arguing' is strategic family therapy."
    ),
    126: (
        "ASD, ID, otitis, already on risperidone, now thrashing in the ED after the ear exam. "
        "The resident gives an extra dose of the home risperidone. "
        "No lorazepam or diphenhydramine — both can disinhibit this kid — and no new olanzapine. "
        "Bottom line: Agitation on a working antipsychotic gets more of that antipsychotic."
    ),
    127: (
        "OCD that had been quiet on fluvoxamine 200 mg is suddenly back; the teen just started vaping. "
        "The resident links nicotine/smoke to CYP1A2 induction and a drop in fluvoxamine. "
        "They do not blame 'SSRI tolerance' or a new diet. "
        "Bottom line: Fluvoxamine plus nicotine can mean a 1A2-induced relapse."
    ),
    128: (
        "On the cortex-development slide, a student points at astrocytes as the migration tracks. "
        "The resident names radial glia as the scaffold prenatal neurons climb. "
        "Oligodendrocytes myelinate later; they do not lay the migratory rails. "
        "Bottom line: Migrating neurons ride radial glia."
    ),
    129: (
        "A year after discharge to pediatrics, a neighbor asks 'how that teen you used to see is doing.' "
        "The psychiatrist says they cannot discuss anyone, because confidentiality survived the transfer. "
        "Beneficence and fidelity do not still require them to treat; privacy still requires silence. "
        "Bottom line: Closed cases stay confidential."
    ),
    130: (
        "Before a forensic interview, the resident tells the youth and parents: this is for the court, not treatment, and what we say is not private. "
        "They do not promise to 'help you feel better' or that the session is therapy. "
        "Recording and diagnosis-confirmation scripts are not the required warning. "
        "Bottom line: Forensic opener is limited confidentiality, not a treatment alliance."
    ),
    131: (
        "A previously well teen has a weak legs, one dim eye, and periventricular plus optic-tract plaques on contrast MRI. "
        "The resident calls multiple sclerosis and gets neurology, not an ALD panel first. "
        "Meningitis and lupus stay on a longer list, not on today's label. "
        "Bottom line: Optic neuritis plus periventricular white-matter lesions in a teen is MS."
    ),
    132: (
        "Parents of an autistic 17-year-old ask if 'kids like this even want partners.' "
        "The resident says romantic interest is usually similar; gender identification with the sex assigned at birth is where ASD samples differ. "
        "They do not assume asexuality. "
        "Bottom line: Autistic youth differ more in gender identity than in wanting a relationship."
    ),
    133: (
        "The fellow spends clinic time at a free site so poor children are not the ones left on leftover antipsychotics. "
        "They name that as justice, not 'being nice' (beneficence) or confidentiality. "
        "The ethics write-up uses the disparity, not the volunteer hours, as the principle. "
        "Bottom line: Fighting who gets the risky prescription is justice."
    ),
    134: (
        "A teen still using diuretics says they kind of want a healthy weight. "
        "The resident asks an open, reflective question about that want, and waits. "
        "No lecture, no thought record, no distress-tolerance worksheet. "
        "Bottom line: Evoking their own reason to change is motivational interviewing."
    ),
    135: (
        "VEOS with waxy flexibility, echolalia, and almost no intake; lorazepam and atypicals have already failed. "
        "The resident books ECT. Clozapine is too slow, and more neuroleptic can worsen catatonia. "
        "rTMS is not the crash treatment. "
        "Bottom line: Benzo-refractory catatonia goes to ECT, including in very-early-onset schizophrenia."
    ),
    136: (
        "Clozapine 200 mg, ANC 1300, no fever. "
        "The resident continues the drug, repeats CBC three times a week, and calls hematology. "
        "They do not stop clozapine for mild neutropenia. "
        "Bottom line: ANC 1000-1499: stay on clozapine, check the count 3x/week."
    ),
    137: (
        "Three weeks of confusion, then psychosis, a seizure, a racing pulse, and an ovarian mass on ultrasound. "
        "The resident treats anti-NMDA-receptor encephalitis and calls gyn-onc and neurology the same hour. "
        "They do not wait for HSV PCR or call this LEMS. "
        "Bottom line: Teen girl, subacute psychosis, seizure, ovarian lesion — anti-NMDA."
    ),
    138: (
        "A week after aripiprazole, a 13-year-old is pacing the ED saying her legs will not sit down. "
        "The resident adds propranolol and holds the dose. "
        "No benztropine (that is dystonia), no dose increase, no swap to risperidone tonight. "
        "Bottom line: Aripiprazole akathisia gets propranolol, not an anticholinergic."
    ),
    139: (
        "A 17-year-old with mild chest twinges spends nights on WebMD and is terrified of the next twinge. "
        "The resident diagnoses illness anxiety disorder, not panic (no attacks) and not conversion. "
        "They start CBT for health anxiety rather than another cardiology loop. "
        "Bottom line: Disease fear with little symptom is illness anxiety, not panic."
    ),
    140: (
        "After a fight with a bully, the fellow wants the 'aggression circuit.' "
        "The resident maps amygdala as alarm, PAG as the fight, and prefrontal cortex as the cost-benefit brake. "
        "They do not put that modulation in the caudate. "
        "Bottom line: Impulsive aggression is gated by PFC cost-benefit math."
    ),
    141: (
        "After a school shooting in the next town, the principal asks for 'the trauma treatment.' "
        "The resident offers Psychological First Aid — Listen, Protect, Connect — to the whole student body, not Coping Cat or CBITS for everyone. "
        "MST and ART stay for kids who already have aggressive disorders. "
        "Bottom line: PFA for all exposed kids is universal prevention."
    ),
    142: (
        "An SLE patient has been frozen in odd postures, mute, not eating, same all day. Lorazepam makes her talk and drink. "
        "The resident diagnoses catatonia, not delirium (no fluctuation) and not NMS. "
        "They keep scheduled benzos while rheumatology treats the lupus. "
        "Bottom line: Odd postures plus a lorazepam rescue is catatonia."
    ),
    143: (
        "Neuropsych is asked whether a child's eyes and hands work together on a complex drawing. "
        "The resident orders a Rey-Osterrieth, not a Rorschach or a WIAT. "
        "KABC can wait; it is not the visuomotor figure copy. "
        "Bottom line: Visuomotor integration is the Rey-Osterrieth Complex Figure."
    ),
    144: (
        "A traumatized teen hears the perpetrator's voice at night. The team is split on 'psychosis.' "
        "The resident treats intact organization as trauma-related until disorganized thought or behavior shows up. "
        "Voices, odd beliefs, and stress flares do not by themselves make schizophrenia. "
        "Bottom line: Disorganization is what separates primary psychosis from trauma phenomena."
    ),
    145: (
        "A four-year-old has one-minute spells of listing, darting eyes, and then is fine; no loss of consciousness. "
        "The resident calls benign paroxysmal vertigo and tells the family migraine is the later risk, not epilepsy. "
        "They do not start an anticonvulsant. "
        "Bottom line: Preschool spinning/nystagmus spells preview migraine."
    ),
    146: (
        "A Salvadoran-American teen is fully English with school friends and fully Spanish over pupusas with both friend groups. "
        "The resident names Berry's integration, not assimilation (that would drop Spanish) or separation. "
        "They treat the bicultural hold as protective, not confused. "
        "Bottom line: Keeping both cultures on purpose is integration."
    ),
    147: (
        "A chronically sleepy teen cannot move on waking and sees figures at the foot of the bed; they dump into sleep in class. "
        "After the history, the resident books overnight PSG plus MSLT. "
        "They skip MWT (that is for treated wakefulness) and skip a first-line brain MRI. "
        "Bottom line: Narcolepsy's essential test is the multiple sleep latency test."
    ),
    148: (
        "Grandparent scolds a five-year-old's 5 a.m. noisy play; the noise gets louder. "
        "The resident says the scolding is the reinforcer and switches the plan to praise quiet, ignore loud. "
        "They do not add a harsher punishment. "
        "Bottom line: Attention that increases a behavior is reinforcement, even when it sounds like scolding."
    ),
    149: (
        "Parents of a child with ADHD ask about later drinking. "
        "The resident treats ADHD itself as the listed childhood diagnosis with the highest adult AUD risk, and does not let CD steal the counseling minute. "
        "They still screen conduct, but the keyed talk today is ADHD. "
        "Bottom line: Childhood ADHD is the keyed lead risk for adult alcohol use disorder."
    ),
    150: (
        "A supervisor asks what self-psychology says is normal in children. "
        "The resident answers narcissism — grandiose self and idealizing needs — not mentalization or object constancy. "
        "They do not pathologize a preschooler's 'I'm the best.' "
        "Bottom line: Kohut: childhood narcissism is development, not a diagnosis."
    ),
}
