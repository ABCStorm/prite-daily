export type MnemonicSource = { label: string; url: string };
export type Mnemonic = {
  id: string;
  title: string;
  purpose: string;
  memoryAid: string;
  breakdown: string[];
  caveat?: string;
  sources: MnemonicSource[];
};

type MnemonicQuestion = {
  stem?: string; answer_text?: string;
  tags?: { diagnosis?: string[]; medication?: string[]; psychotherapy?: string[]; neuro?: string[] } | unknown[];
};

const REVIEW = "https://pmc.ncbi.nlm.nih.gov/articles/PMC7232614/";
const P = (path: string) => `https://www.psychdb.com/${path}`;
const src = (label: string, url: string): MnemonicSource => ({ label, url });
const psychdb = (label: string, path: string) => [src(`PsychDB: ${label}`, P(path))];
const review = [src("Peer-reviewed DSM mnemonic scoping review", REVIEW)];
const m = (id: string, title: string, purpose: string, memoryAid: string, breakdown: string[], sources: MnemonicSource[], caveat?: string): Mnemonic =>
  ({ id, title, purpose, memoryAid, breakdown, sources, caveat });

// Acronyms are retained where they are established memory aids, but all
// expansions and cautions are independently phrased. A mnemonic supplements
// the full criteria; it never substitutes for them or for clinical judgment.
const CATALOG: Record<string, Mnemonic> = {
  mdd: m("mdd", "M-SIG-E-CAPS", "Major depressive episode symptoms", "Mood plus SIG-E-CAPS", ["M — depressed mood", "S — sleep change", "I — reduced interest/pleasure", "G — guilt or worthlessness", "E — low energy", "C — poor concentration", "A — appetite/weight change", "P — psychomotor change", "S — suicidal thoughts or behavior"], psychdb("Major Depressive Disorder", "mood/1-depression/home"), "A major depressive episode requires at least 5 symptoms in the same 2-week period, including depressed mood or anhedonia, plus impairment and appropriate exclusions."),
  pdd: m("pdd", "Persistent depression: rule of 2s", "Persistent depressive disorder timing", "2 years, 2 associated symptoms, no symptom-free period over 2 months", ["2 years — 1 year in children/adolescents", "2 associated symptoms", "2 months — longest symptom-free interval"], psychdb("Persistent Depressive Disorder", "mood/persistent-depressive-disorder-dysthymia")),
  mania: m("mania", "DIG FAST", "Manic/hypomanic symptoms", "DIG FAST through the activated symptoms", ["D — distractibility", "I — impulsive or risky activity", "G — grandiosity", "F — flight of ideas/racing thoughts", "A — increased goal-directed activity or agitation", "S — decreased need for sleep", "T — talkativeness/pressured speech"], psychdb("Bipolar II Disorder", "bipolar/bipolar-ii"), "Also apply the required mood/energy change, duration, severity, and exclusions. Psychosis makes an episode manic, not hypomanic."),
  gad: m("gad", "BESKIM", "GAD associated symptoms", "BESKIM accompanies excessive, difficult-to-control worry", ["B — blank mind/poor concentration", "E — easily fatigued", "S — sleep disturbance", "K — keyed up/restless", "I — irritability", "M — muscle tension"], psychdb("Generalized Anxiety Disorder", "anxiety/gad"), "Adults need at least 3 associated symptoms; children need at least 1. Worry persists more days than not for at least 6 months."),
  ptsd: m("ptsd", "E-I-A-N-A", "PTSD diagnostic sequence", "Exposure → Intrusion → Avoidance → Negative cognition/mood → Arousal/reactivity", ["E — qualifying trauma exposure", "I — intrusion", "A — avoidance", "N — negative cognition and mood", "A — arousal/reactivity changes"], psychdb("Posttraumatic Stress Disorder", "trauma-and-stressors/ptsd"), "Symptoms must persist longer than one month and cause distress or impairment; use the full criteria and exclusions."),
  adjustment: m("adjustment", "Adjustment: 3 in, 6 out", "Adjustment-disorder timing", "Begins within 3 months; usually ends within 6 months after the stressor or its consequences end", ["3 in — onset within 3 months", "6 out — no persistence beyond 6 months after the stressor/consequences end"], review, "An ongoing stressor can support a persistent course."),
  adhd: m("adhd", "ADHD: 6–6–12–2", "ADHD timing and setting anchors", "6 symptoms for 6 months, several before 12, across 2 settings", ["6 symptoms — 5 per domain at age 17+", "6 months — minimum duration", "Before 12 — several symptoms present", "2 settings — minimum breadth"], review),
  autism: m("autism", "Autism: Social + Restricted/Repetitive", "The two required autism-spectrum domains", "Social communication/interaction deficits plus restricted/repetitive behavior—early and impairing", ["Social — reciprocity, nonverbal communication, relationships", "Restricted/repetitive — at least 2 patterns", "Early + impairing — developmental onset and clinical significance"], review),
  personality: m("personality", "Personality clusters: odd, dramatic, anxious", "Cluster A/B/C organization", "A is odd/eccentric, B dramatic/erratic, C anxious/fearful", ["A — paranoid, schizoid, schizotypal", "B — antisocial, borderline, histrionic, narcissistic", "C — avoidant, dependent, obsessive-compulsive personality"], psychdb("Introduction to Personality Disorders", "personality/introduction")),
  antisocial: m("antisocial", "CORRUPT", "Antisocial personality features", "Disregard for and violation of others' rights", ["C — cannot conform to law", "O — obligations ignored", "R — reckless", "R — remorseless", "U — underhanded/deceitful", "P — poor planning/impulsive", "T — temper/aggression"], psychdb("Antisocial Personality Disorder", "personality/antisocial"), "Also requires age 18+ and evidence of conduct disorder before age 15."),
  psychosis_time: m("psychosis_time", "Psychosis duration ladder", "Brief psychotic vs schizophreniform vs schizophrenia", "1 day → 1 month → 6 months", ["1 day to <1 month — brief psychotic disorder", "1–6 months — schizophreniform disorder", "≥6 months total — schizophrenia"], review, "Duration alone is not diagnostic; assess mood, substances, medical causes, function, and culture."),
  schizoaffective: m("schizoaffective", "Schizoaffective: 2 alone, mood for most", "Separate schizoaffective disorder from mood disorder with psychosis", "At least 2 weeks psychosis without a major mood episode; mood episodes occupy most of the illness", ["2 alone — psychosis without a major mood episode", "Mood for most — majority of total illness duration"], review),
  ocd: m("ocd", "OCD: intrude → neutralize → time/distress", "Core obsession–compulsion relationship", "Obsessions intrude; compulsions try to neutralize; the cycle consumes time or impairs", ["Intrude — unwanted recurrent thoughts/urges/images", "Neutralize — repetitive behavior or mental acts", "Time/distress — time-consuming or clinically significant"], review),
  delirium: m("delirium", "AIDA", "Core delirium features in CAM", "Acute/fluctuating + Inattention, with Disorganized thinking or Altered consciousness", ["A — acute and fluctuating", "I — inattention", "D — disorganized thinking", "A — altered consciousness"], psychdb("Delirium", "cl/1-delirium"), "CAM requires features 1 and 2 plus either 3 or 4."),
  cognition: m("cognition", "SAMPLE", "Six major neurocognitive domains", "Social, Attention, Memory, Perceptual-motor, Language, Executive", ["S — social cognition", "A — complex attention", "M — learning and memory", "P — perceptual-motor", "L — language", "E — executive function"], psychdb("Introduction to Memory and Cognition", "cognitive-testing/memory")),
  somatic: m("somatic", "TEA", "Somatic symptom disorder's excessive response", "Thoughts, Emotion, Actions are excessive around the symptom", ["T — disproportionate persistent thoughts", "E — persistently high health anxiety", "A — excessive time and energy"], review),
  anorexia: m("anorexia", "RID", "Core anorexia nervosa criteria", "Restriction, Intense fear, Distorted experience", ["R — restriction causing significantly low weight", "I — intense fear or weight-gain interference", "D — disturbed weight/shape experience or poor recognition of seriousness"], psychdb("Anorexia Nervosa", "eating-disorders/anorexia")),
  bulimia: m("bulimia", "Bulimia: binge, compensate, overvalue", "Core bulimia pattern", "Recurrent binge + recurrent compensation + shape/weight overvaluation", ["Binge — large amount with loss of control", "Compensate — vomiting, laxatives, fasting, or excessive exercise", "Overvalue — self-evaluation unduly tied to shape/weight"], review, "Binge and compensation occur at least weekly for 3 months and not exclusively during anorexia nervosa."),
  insomnia: m("insomnia", "Insomnia: 3–3–3", "Chronic insomnia frequency and duration", "3 forms, at least 3 nights/week, at least 3 months", ["3 forms — initiating, maintaining, or early awakening", "3 nights/week — minimum frequency", "3 months — minimum duration"], review, "Adequate sleep opportunity and daytime distress/impairment are also required."),
  narcolepsy: m("narcolepsy", "CHESS", "Classic narcolepsy features", "Cataplexy, Hallucinations, Excessive sleepiness, Sleep paralysis, Sleep disruption", ["C — cataplexy", "H — hypnagogic/hypnopompic hallucinations", "E — excessive daytime sleepiness", "S — sleep paralysis", "S — disrupted sleep"], review, "Formal diagnosis uses recurrent sleep attacks plus cataplexy, hypocretin deficiency, or qualifying sleep-study evidence."),
  rls: m("rls", "URGE", "Restless legs syndrome pattern", "Urge, Rest-induced, Gets better with movement, Evening predominance", ["U — urge to move", "R — rest worsens", "G — gets better with activity", "E — evening/night predominance"], review),
  osa: m("osa", "STOP-BANG", "Obstructive sleep-apnea screening", "Snoring, Tired, Observed apnea, Pressure; BMI, Age, Neck, Gender", ["STOP — snoring, tiredness, observed apnea, high blood pressure", "BANG — BMI, age, neck circumference, male sex in the original tool"], review, "This is a screening tool, not a diagnosis."),
  sleep_waves: m("sleep_waves", "BAT-D", "EEG waves from wakefulness toward deep sleep", "Beta → Alpha → Theta → Delta", ["B — beta: alert wakefulness", "A — alpha: relaxed wakefulness", "T — theta: lighter NREM", "D — delta: deep N3"], psychdb("Introduction to Sleep Medicine", "sleep/1-introduction/home")),
  mi: m("mi", "OARS + DARN CAT", "Motivational interviewing skills and change talk", "OARS elicits; DARN prepares; CAT mobilizes", ["OARS — open questions, affirmations, reflections, summaries", "DARN — desire, ability, reasons, need", "CAT — commitment, activation, taking steps"], psychdb("Motivational Interviewing", "psychotherapy/mi")),
  mature_defenses: m("mature_defenses", "Mature adults wear a SASH", "Four mature defenses", "Sublimation, Altruism, Suppression, Humor", ["S — sublimation", "A — altruism", "S — suppression", "H — humor"], psychdb("Defenses", "psychotherapy/psychodynamic/defenses")),
  mse: m("mse", "ASEPTIC", "Mental status examination domains", "Appearance, Speech, Emotion, Perception, Thought, Insight/judgment, Cognition", ["A — appearance/behavior", "S — speech", "E — emotion: mood/affect", "P — perception", "T — thought content/process", "I — insight/judgment", "C — cognition"], psychdb("Mental Status Exam", "teaching/mental-status-exam-mse")),
  lithium: m("lithium", "LMNOP", "Important lithium adverse effects", "Lithium: Movement, Nephrology, hypOthyroidism, Pregnancy", ["M — tremor", "N — nephrogenic DI/kidney injury", "O — hypothyroidism", "P — pregnancy cardiac-malformation risk"], psychdb("Lithium", "meds/mood-stabilizers-anticonvulsants/1-lithium"), "Also remember GI effects, weight gain, hypercalcemia, leukocytosis, cardiac effects, and toxicity interactions."),
  nms: m("nms", "FEVERR", "Neuroleptic malignant syndrome", "Fever, Encephalopathy, Vital instability, Enzyme elevation, Rhabdomyolysis, Rigidity", ["F — fever", "E — encephalopathy", "V — vital instability", "E — elevated CK", "R — rhabdomyolysis", "R — lead-pipe rigidity"], psychdb("Neuroleptic Malignant Syndrome", "meds/antipsychotics/nms-neuroleptic-malignant-syndrome")),
  serotonin: m("serotonin", "MOIST", "Hunter serotonin-toxicity criteria", "Muscle rigidity/fever/clonus; Ocular; Inducible; Spontaneous clonus; Tremor/hyperreflexia", ["M — rigidity + fever + ocular/inducible clonus", "O — ocular clonus + agitation/diaphoresis", "I — inducible clonus + agitation/diaphoresis", "S — spontaneous clonus", "T — tremor + hyperreflexia"], psychdb("Serotonin Syndrome", "meds/antidepressants/serotonin")),
  finish: m("finish", "FINISH", "Antidepressant discontinuation syndrome", "Flu-like, Insomnia, Nausea, Imbalance, Sensory changes, Hyperarousal", ["F — flu-like symptoms", "I — insomnia", "N — nausea", "I — imbalance", "S — sensory disturbances", "H — hyperarousal"], review),
  eps: m("eps", "D-A-P-T over time", "Typical EPS order", "Dystonia → Akathisia → Parkinsonism → Tardive dyskinesia", ["D — hours to days", "A — days to weeks", "P — weeks to months", "T — months to years"], psychdb("Extrapyramidal Symptoms", "meds/antipsychotics/eps"), "Onset windows overlap; identify the movement phenotype rather than relying on timing alone."),
  parkinson: m("parkinson", "TRAP", "Cardinal Parkinson motor findings", "Tremor, Rigidity, Akinesia/bradykinesia, Postural instability", ["T — rest tremor", "R — rigidity", "A — akinesia/bradykinesia", "P — postural instability"], psychdb("Parkinson's Disease", "geri/parkinsons")),
  wernicke: m("wernicke", "Wernicke: C-A-E", "Classic Wernicke encephalopathy triad", "Confusion, Ataxia, Eye-movement abnormalities", ["C — confusion", "A — gait/truncal ataxia", "E — ophthalmoplegia or nystagmus"], psychdb("Wernicke-Korsakoff Syndrome", "cl/wernicke-korsakoff"), "The full triad is often absent; suspected disease requires prompt parenteral thiamine before carbohydrate."),
  test_accuracy: m("test_accuracy", "SnNout and SpPin", "High sensitivity and specificity", "Sensitive + Negative helps rule out; Specific + Positive helps rule in", ["SnNout — highly sensitive test is negative", "SpPin — highly specific test is positive"], [src("PMC: Applying diagnostic-test results", "https://pmc.ncbi.nlm.nih.gov/articles/PMC3572661/")], "Likelihood ratios are more precise than this shortcut."),
  errors: m("errors", "Alpha alarms; beta blinds", "Type I and II errors", "Alpha false alarm; beta misses a real effect", ["Type I / α — false positive", "Type II / β — false negative", "Power — 1 − β"], [src("NIST: Type I and Type II errors", "https://www.itl.nist.gov/div898/handbook/prc/section1/prc131.htm")]),
  capacity: m("capacity", "CUAR", "Decision-making capacity abilities", "Communicate, Understand, Appreciate, Reason", ["C — communicate a choice", "U — understand information", "A — appreciate personal consequences", "R — reason about options"], [src("AAFP: Evaluating Medical Decision-Making Capacity", "https://www.aafp.org/pubs/afp/issues/2018/0701/p40.html")], "Capacity is decision-specific and can fluctuate; competency is a legal determination."),
  malpractice: m("malpractice", "Four Ds of negligence", "Elements of malpractice", "Duty, Dereliction, Direct causation, Damages", ["Duty — professional duty existed", "Dereliction — standard was breached", "Direct causation — breach caused injury", "Damages — compensable injury"], [src("PMC: Malpractice Law and Psychiatry", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7011304/")]),
};

const DIAGNOSIS: Record<string, string[]> = {
  "major-depression": ["mdd"], "persistent-depressive": ["pdd"], bipolar: ["mania"], GAD: ["gad"], PTSD: ["ptsd"],
  adjustment: ["adjustment"], adhd: ["adhd"], autism: ["autism"], "personality-disorder": ["personality"],
  schizophrenia: ["psychosis_time"], "brief-psychotic": ["psychosis_time"], schizoaffective: ["schizoaffective", "psychosis_time"],
  OCD: ["ocd"], delirium: ["delirium"], dementia: ["cognition"], "somatic-symptom": ["somatic"], anorexia: ["anorexia"],
  bulimia: ["bulimia"], insomnia: ["insomnia"], narcolepsy: ["narcolepsy"], rls: ["rls"], "sleep-apnea": ["osa"],
};

const tags = (q: MnemonicQuestion, key: "diagnosis" | "medication" | "psychotherapy" | "neuro") =>
  q.tags && !Array.isArray(q.tags) && Array.isArray(q.tags[key]) ? q.tags[key]! : [];

/** Deterministically select at most two relevant, source-backed memory aids. */
export function mnemonicsForQuestion(q: MnemonicQuestion): Mnemonic[] {
  const ids: string[] = [];
  const add = (id: string) => { if (CATALOG[id] && !ids.includes(id)) ids.push(id); };
  for (const d of tags(q, "diagnosis")) for (const id of DIAGNOSIS[d] || []) add(id);
  const text = `${q.stem || ""}\n${q.answer_text || ""}`.toLowerCase();
  if (/antisocial personality/.test(text)) add("antisocial");
  if (/mental status (exam|examination)|\bmse\b/.test(text)) add("mse");
  if (/sleep (stage|architecture)|brain wave|\b(delta|theta|alpha|beta) wave/.test(text)) add("sleep_waves");
  if (tags(q, "psychotherapy").includes("motivational") || /motivational interview/.test(text)) add("mi");
  if (/defense mechanism|mature defense/.test(text)) add("mature_defenses");
  if (tags(q, "medication").includes("lithium")) add("lithium");
  if (/neuroleptic malignant|\bnms\b/.test(text)) add("nms");
  if (/serotonin syndrome|serotonin toxicity/.test(text)) add("serotonin");
  if (/antidepressant discontinuation|ssri discontinuation|antidepressant withdrawal/.test(text)) add("finish");
  if (/extrapyramidal|acute dystonia|akathisia|tardive dyskinesia|drug-induced parkinson/.test(text)) add("eps");
  if (/parkinson('|’)s disease|parkinson disease/.test(text)) add("parkinson");
  if (/wernicke('|’)s encephalopathy|wernicke encephalopathy|wernicke-korsakoff/.test(text)) add("wernicke");
  if (/sensitivity|specificity|false positive|false negative/.test(text)) add("test_accuracy");
  if (/type i error|type ii error|alpha error|beta error|statistical power/.test(text)) add("errors");
  if (/decision-making capacity|decision making capacity|capacity to (consent|refuse)|lacks capacity/.test(text)) add("capacity");
  if (/medical malpractice|professional negligence|malpractice claim/.test(text)) add("malpractice");
  return ids.slice(0, 2).map((id) => CATALOG[id]);
}

export const mnemonicCatalog = Object.freeze(Object.values(CATALOG));
