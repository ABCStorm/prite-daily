/**
 * Dynamic Dawg belongs on questions where a psychotherapeutic formulation can
 * add something clinically useful. Pure research methods, statistics,
 * neuroanatomy, receptor science, genetics, and other biomedical recall items
 * without a patient-care scenario are intentionally omitted.
 */

const DIRECT_THERAPY = /(?:psychotherap|psychoanaly|psychodynamic|cognitive[- ]behavio(?:u)?ral|dialectical[- ]behavio(?:u)?ral|behavioral technique|behavioural technique|therapist|therapeutic (?:alliance|relationship|frame)|treatment milieu|transference|countertransference|interpretation|resistance|working through|free association|defen[sc]e mechanism|unconscious|mentalization|object relations|supportive therapy|motivational interviewing|interpersonal therapy|group therapy|family therapy|couples? therapy|termination (?:phase|of therapy|in therapy)|treatment session|empathic response|informed consent|proxy consent|no longer wishes to participate|confidentiality|fiduciary|decision-making capacity|legal guardian|duty to warn|duty to protect|\bHIPAA\b|\bM['’]?Naughten\b|\b(?:Freud|Kohut|Kernberg|Winnicott|Klein|Bion|Erikson|Menninger|Davanloo)\b)/i;

// Some banks are classified as statistics/epidemiology despite asking about a
// psychologically meaningful safety, identity, or developmental issue. This
// signal only rescues category fallbacks; an explicit research/biomedical
// methods signal below still wins.
const PSYCHOSOCIAL_TOPIC = /(?:suicid|self-harm|violence|abuse|bereavement|intimate partner|domestic violence|race|racial|ethnic|cultur|socioeconomic|resilien|spiritual|postpartum|bulimia|anorexia|eating disorder|enuresis|toileting accident|normal child development|patient handoff|mental health court|habituation|repeated presentation|anxiety disorders? when compared|threat toward painful stimuli)/i;

const RESEARCH_SCIENCE = /(?:\bstatistic(?:al|s)?\b|\bstudy design\b|\bresearch (?:method|design|sample|study)\b|\brandomi[sz](?:e|ed|ation)\b|\b(?:double|single)[- ]blind\b|\bplacebo[- ]controlled\b|\bcase[- ]control\b|\bcohort study\b|\bcross[- ]sectional\b|\bcrossover design\b|\bclinical trial\b|\bmeta-analysis\b|\bsystematic review\b|\bsample size\b|\bpower analysis\b|\btype [i1]{1,2} error\b|\bnull hypothesis\b|\bp[- ]?value\b|\bconfidence interval\b|\bodds ratio\b|\brelative risk\b|\brisk ratio\b|\bnumber needed to treat\b|\bincidence\b|\bprevalence\b|\bpositive predictive value\b|\bnegative predictive value\b|\bsensitivity and specificity\b|\b(?:validity|reliability|interrater reliability)\b|\bcorrelation coefficient\b|\bregression analysis\b|\bfactor analysis\b|\bstandard deviation\b|\bstandard error\b|\bchi[- ]square\b|\banalysis of variance\b|\bANOVA\b|\bepidemiolog(?:y|ical)\b|\bindependent variable\b|\bdependent variable\b|\bmethodological limitation\b|\bassessment instrument\b.{0,80}\b(?:replicat|measure|valid|reliab))/i;

const BIOMEDICAL_SCIENCE = /(?:\breceptor(?:s)?\b|\bneurotransmit|\bsecond messenger\b|\b(?:agonist|antagonist)s?\b|\breuptake\b|\bchromosome\b|\bgenetic|\bgenomic|\bgene\b|\ballele\b|\btrinucleotide\b|\btriple[- ]repeat\b|\bprotein(?:s)?\b|\benzyme(?:s)?\b|\bisoenzyme\b|\bcytochrome\b|\bmetaboli[ct]|\belectrolyte|\bserum\b|\bplasma\b|\burine\b|\blaboratory\b|\bhalf[- ]life\b|\bclearance\b|\bpharmacokinetic|\bbioavailability\b|\bmechanism of action\b|\bmolecular mechanism\b|\bbrain (?:region|area|structure)\b|\bneuroanatom|\bnucleus accumbens\b|\bcell bodies\b|\bneural pathway\b|\bneuronal (?:loss|deposition|migration|circuit)\b|\btract\b|\bcranial nerve\b|\bsynaptic|\bdendrit|\baxon|\bmyelin|\bEEG\b|\belectroenceph|\bMRI\b|\bmagnetic resonance\b|\bcomputed tomography\b|\bPET scan\b|\bSPECT\b|\bcerebrospinal|\bCSF\b|\bhormone(?:s)?\b|\bendocrine\b|\bamino acid\b|\bneuropatholog|\bhistolog|\bmicroscop|\bautonomic nervous\b|\bsympathetic\b|\bparasympathetic\b|\baction potential\b|\bion channel\b|\bGABA[- ]?[AB]\b|\b5[- ]?HT\w*\b|\bdopaminergic\b|\bserotonergic\b|\bnoradrenergic\b|\bcholinergic\b|\bmuscarinic\b|\bnicotinic\b|\bbiochemical\b|\bpathophysiolog|\bmutation(?:s)?\b|\bautosomal\b|\bmitochondrial\b|\bchromosomal\b|\bkaryotype\b|\bpolymorphism\b)/i;

const CARE_SCENARIO = /(?:\b\d{1,3}[- ]year[- ]old\b|\b(?:a|an|the|this) (?:patient|client)\b.{0,320}\b(?:presents?|reports?|complains?|tells?|awakens?|is brought|was brought|is referred|was referred|returns?|develops?|experiences?|becomes?|is admitted|was admitted|is treated|is receiving|has been receiving|comes to|seeks|asks|states?|describes?|denies?|begins?|was started|is found|is evaluated|undergoes?|is undergoing|is scheduled|fails?|walks?|appears?|participates?|is followed|suffers?|does not|cannot|is able|is unable|receives?|was seen|has gained|takes?)\b|\b(?:in|during|after|before) .{0,50}\b(?:therapy|treatment|clinical|psychiatric|medical|hospital|emergency|office|clinic|session|consultation|evaluation|examination|appointment|visit)\b|\b(?:therapist|psychiatrist|clinician|resident|physician)\b.{0,120}\b(?:patient|client|treatment|session|evaluate|assess|manage|respond|recommend|prescribe|asks?|reports?)\b|\bbrought to (?:the )?(?:emergency department|hospital|clinic)\b|\bmental status (?:examination|exam)\b)/is;

// These banks are scientific by construction. A genuine care vignette can
// still keep the pearl; a free-standing recall question cannot.
const SCIENCE_FIRST_CATEGORIES = new Set([
  "neuro_sci",
  "neurosciences",
  "neurology",
  "research_stats",
  "epidemiology",
]);

export function dynPerspectiveExclusionReason(question) {
  const stem = String(question?.stem || "");
  if (DIRECT_THERAPY.test(stem)) return null;

  const researchScience = RESEARCH_SCIENCE.test(stem);
  const biomedicalScience = BIOMEDICAL_SCIENCE.test(stem);
  // A research setup may mention patients, but it is not a patient-care
  // encounter. Treat the methods signal as authoritative in that case.
  const hasCareScenario = CARE_SCENARIO.test(stem) && !researchScience;

  if (researchScience && !hasCareScenario) {
    return "research/statistics without a patient-care scenario";
  }
  if (biomedicalScience && !hasCareScenario) {
    return "biomedical science without a patient-care scenario";
  }
  if (SCIENCE_FIRST_CATEGORIES.has(question?.prite_category) && !hasCareScenario && !PSYCHOSOCIAL_TOPIC.test(stem)) {
    return "science-first category without a patient-care scenario";
  }
  return null;
}

export function isDynPerspectiveEligible(question) {
  return dynPerspectiveExclusionReason(question) === null;
}
