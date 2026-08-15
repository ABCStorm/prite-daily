#!/usr/bin/env python3
"""Historical / gee-whiz context for Neuro + Therapy items.

Every fact is a real, checkable story (eponym, landmark paper, odd origin).
The matcher never invents a number. Questions without a keyword hit get a
chapter- or modality-level story instead of a generic "this item drills…" line.
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
THERAPY = ROOT / "public" / "data" / "therapy_questions.json"
KAUFMAN = ROOT / "reference" / "kaufman" / "questions.json"
OUT = ROOT / "public" / "data" / "bank_context.json"

# (id, keywords, text) — keywords are matched as whole phrases when they contain
# a space, otherwise as word-ish tokens against stem + answer + tags.
FACTS: list[tuple[str, list[str], str]] = [
    # --- neurology eponyms & landmarks ---
    ("broca-tan", ["broca", "expressive aphasia", "nonfluent aphasia", "inferior frontal", "tan"],
     "In 1861 Pierre Paul Broca presented “Tan,” a patient who could only utter that one syllable. Autopsy showed a left posterior inferior frontal lesion — the first widely accepted localization of language, and the reason we still call nonfluent aphasia Broca’s."),
    ("wernicke-1874", ["wernicke", "receptive aphasia", "fluent aphasia", "superior temporal"],
     "Carl Wernicke was 26 in 1874 when he described fluent but empty speech after a left superior temporal lesion. He also sketched the first disconnection model of language — the ancestor of every “conduction aphasia” question."),
    ("conduction-arcuate", ["conduction aphasia", "arcuate fasciculus", "repetition"],
     "Conduction aphasia — fluent speech, good comprehension, wrecked repetition — is the classic arcuate-fasciculus disconnection. Wernicke predicted it on paper years before anyone found a clean case."),
    ("hm-scoville", ["hm", "h.m.", "henry molaison", "bilateral medial temporal", "anterograde amnesia", "hippocampus"],
     "Henry Molaison (“H.M.”) had bilateral medial temporal lobes removed in 1953 for epilepsy. He kept working memory and old memories but almost no new episodic memory — the case that taught a century of psychiatry that the hippocampus writes the diary."),
    ("penfield-montreal", ["penfield", "homunculus", "cortical stimulation", "montreal"],
     "Wilder Penfield’s Montreal stimulation maps, drawn on awake neurosurgical patients, gave us the motor and sensory homunculi. The oversized lips and hands are not a cartoon — they are how much cortex those parts actually own."),
    ("babinski-1896", ["babinski", "plantar", "upgoing toe", "extensor plantar"],
     "Joseph Babinski described the upgoing toe in 1896 as a way to separate organic from hysterical weakness. The sign is a release of a primitive flexion reflex once the pyramidal tract is damaged."),
    ("horner-story", ["horner", "ptosis", "miosis", "anhydrosis", "oculosympathetic"],
     "Johann Friedrich Horner’s 1869 triad — ptosis, miosis, anhidrosis — is a lesion anywhere along the three-neuron oculosympathetic chain. A painful Horner after neck trauma is a carotid dissection until proven otherwise, a fact that has saved more than a few young “migraine” patients."),
    ("argyll-robertson", ["argyll robertson", "prostitute's pupil", "accommodates but does not react", "light-near dissociation"],
     "Argyll Robertson pupils “accommodate but do not react.” Victorian wags called them prostitute’s pupils: they accommodate (to near) but do not react (to light) — and they pointed to neurosyphilis."),
    ("adie-pupil", ["adie", "tonic pupil", "holmes-adie"],
     "Adie’s tonic pupil is a young woman’s story: a large pupil that slowly constricts to near, with vermiform iris movements, plus lost ankle jerks. It is a ciliary-ganglion curiosity, not a neurosurgical emergency — which is why knowing the eponym calms everyone down."),
    ("weber-midbrain", ["weber syndrome", "ipsilateral three", "contralateral hemiparesis", "cerebral peduncle"],
     "Weber syndrome is a midbrain postcard: ipsilateral III and contralateral hemiparesis from a cerebral-peduncle infarct. It is named for Sir Hermann David Weber, a Victorian London physician, not the physicist."),
    ("millard-gubler", ["millard-gubler", "ventral pons", "ipsilateral six", "ipsilateral seven"],
     "Millard–Gubler is ventral pons: ipsilateral VI and VII plus contralateral body weakness. Two 19th-century Frenchmen described it; every boards question still uses their names as a zip code for the basis pontis."),
    ("bell-palsy", ["bell's palsy", "bell palsy", "idiopathic facial", "facial nerve"],
     "Charles Bell (of the Bell–Magendie law) described facial-nerve palsy in 1821. The “Bell’s palsy” we treat with steroids is idiopathic VII; forehead sparing still means “think upper motor neuron” the way Bell first taught."),
    ("wallenberg", ["wallenberg", "lateral medullary", "pica", "vertebral artery"],
     "Adolf Wallenberg’s 1895 lateral medullary syndrome is a greatest-hits list of brainstem anatomy in one infarct: crossed face/body sensory loss, Horner, ataxia, hoarseness, vertigo. Most are vertebral, not textbook PICA."),
    ("anton-cortical-blind", ["anton", "cortical blindness", "anosognosia for blindness"],
     "Anton syndrome is cortical blindness plus the insistence that one can still see. Gabriel Anton described it in 1899. It is anosognosia for a visual cortex that has gone dark — unforgettable once you have met it."),
    ("gerstmann", ["gerstmann", "finger agnosia", "agraphia", "acalculia", "left-right"],
     "Josef Gerstmann’s tetrad — finger agnosia, agraphia, acalculia, left–right confusion — maps to the dominant angular gyrus. Whether it is a “true syndrome” is still argued; the four signs as a cluster remain a boards favorite."),
    ("korsakoff-wernicke", ["korsakoff", "wernicke encephalopathy", "mammillary", "thiamine", "confabulation"],
     "Sergei Korsakoff described the amnestic-confabulatory state in 1887; Carl Wernicke the acute triad two years earlier. They are one thiamine-deficiency disease at two time points. Mammillary bodies and medial thalami are the lesions that stick on MRI — and in memory."),
    ("alzheimer-august-d", ["alzheimer", "amyloid", "neurofibrillary", "august d"],
     "Alois Alzheimer presented Auguste Deter in 1906: progressive dementia with plaques and tangles. Kraepelin put Alzheimer’s name on the disease. The same plaques still define the pathology more than a century later."),
    ("lewy-bodies", ["lewy", "alpha-synuclein", "dementia with lewy", "lewy body"],
     "Friedrich Lewy found the inclusions in 1912 while working in Alzheimer’s lab. Decades later they turned out to be α-synuclein — the same protein that links Parkinson disease, Lewy-body dementia, and multiple-system atrophy."),
    ("parkinson-1817", ["parkinson", "shaking palsy", "lewy", "substantia nigra"],
     "James Parkinson’s 1817 Essay on the Shaking Palsy described six Londoners he mostly watched on the street. The substantia nigra story came later (Tretiakoff, 1919); levodopa that actually worked came with Cotzias in the 1960s."),
    ("cotzias-ldopa", ["levodopa", "l-dopa", "carbidopa", "sinemet"],
     "George Cotzias showed in 1967 that high-dose D,L- then L-dopa melted parkinsonism. Adding carbidopa (Sinemet, 1975) kept the dose in the brain and the nausea out of the gut. It is still the most theatrical drug effect in neurology."),
    ("huntington-1872", ["huntington", "caudate", "anticipation", "cag", "chromosome 4"],
     "George Huntington was 22 when he published his Long Island family paper in 1872. The CAG repeat on chromosome 4 (1993) explained the anticipation those families had watched for generations — a gene you can count."),
    ("wilson-copper", ["wilson", "kayser-fleischer", "ceruloplasmin", "atp7b"],
     "S. A. Kinnier Wilson described hepatolenticular degeneration in 1912. Kayser–Fleischer rings are copper in Descemet’s membrane — one of the few times a slit lamp makes a neuropsychiatric diagnosis."),
    ("charcot-ms", ["multiple sclerosis", "charcot", "oligoclonal", "internuclear ophthalmoplegia"],
     "Charcot’s 1868 lectures made “sclérose en plaques” a disease, complete with nystagmus, intention tremor, and scanning speech. Oligoclonal bands came a century later; they are still the CSF signature residents look for."),
    ("guillain-barre", ["guillain", "barre", "aidp", "albuminocytologic", "areflexic"],
     "Guillain, Barré, and Strohl described the areflexic paralysis with albumino-cytologic dissociation in 1916, in French soldiers. The cytoalbuminologic split — high protein, few cells — is still the lumbar-puncture pearl."),
    ("duchenne-1855", ["duchenne", "gowers", "dystrophin", "calf hypertrophy"],
     "Duchenne de Boulogne described the childhood dystrophy in 1861; Gowers later added the climb-up-one’s-own-legs sign. Dystrophin (1986–87) turned a clinical picture into a named protein — and a gene-therapy target."),
    ("myasthenia-walker", ["myasthenia", "edrophonium", "tensilon", "ice pack", "pyridostigmine"],
     "Mary Walker, a London house officer, reversed myasthenia with physostigmine in 1934 after reasoning it looked like curare poisoning. The “Miracle of St. Alfege’s” is why AChE inhibitors still open the chapter."),
    ("lambert-eaton", ["lambert-eaton", "presynaptic calcium", "vgcc", "small cell", "improves with use"],
     "Lambert–Eaton (1956–57) is the paraneoplastic opposite of myasthenia: strength that improves with use, dry mouth, and P/Q-type calcium-channel antibodies, classically beside small-cell lung cancer."),
    ("als-charcot-gehrig", ["amyotrophic", "als", "lou gehrig", "motor neuron", "split hand"],
     "Charcot named ALS in 1874. Americans know it as Lou Gehrig’s disease after the Yankee first baseman’s 1939 farewell. Upper plus lower motor neurons in one patient is still the clinical definition."),
    ("rett-mecp2", ["rett", "mecp2", "hand wringing", "regression girls"],
     "Andreas Rett filmed hand-wringing girls in Vienna in 1966; nobody read the German paper. Bengt Hagberg rediscovered it in 1983, and MECP2 (1999) made it a named genetic disease of apparently typical early development then regression."),
    ("cjd-prion", ["creutzfeldt", "jakob", "prion", "14-3-3", "periodic sharp"],
     "Creutzfeldt (1920) and Jakob (1921) described a rapidly dementing illness; Prusiner’s prions (Nobel 1997) explained it. Periodic sharp waves and 14-3-3 are supportive — the horror is how a misfolded protein templates the next one."),
    ("tourette-charcot", ["tourette", "coprolalia", "tic", "Gilles de la Tourette"],
     "Gilles de la Tourette described the tic disorder in 1885 under Charcot. Coprolalia is famous and uncommon; the useful fact is how often OCD and ADHD ride along — Charcot’s student already noticed the psychiatric company."),
    ("sydenham-chorea", ["sydenham", "st. vitus", "rheumatic", "group a strep", "pandas"],
     "Thomas Sydenham described St. Vitus’s dance in 1686. It is still rheumatic fever’s neurologic signature: a fidgety child after group A strep, sometimes with a surprising load of OCD."),
    ("jackson-march", ["jacksonian", "march", "todd's paralysis", "todd paralysis"],
     "Hughlings Jackson watched seizures march up a limb and inferred a somatotopic motor cortex decades before Penfield stimulated one. Todd’s paralysis — post-ictal weakness — is the leftover that still fools people into calling a seizure a stroke."),
    ("berger-eeg", ["eeg", "berger", "alpha rhythm", "10 hz"],
     "Hans Berger recorded the first human EEG in 1924 (published 1929) and named the 10 Hz posterior rhythm “alpha.” He was a psychiatrist looking for a physical basis of mental life. Every sleep staging still starts from his waves."),
    ("merritt-putnam-phenytoin", ["phenytoin", "dilantin", "merritt", "putnam"],
     "Tracy Putnam and H. Houston Merritt screened compounds in cats in 1936–38 and found phenytoin — anticonvulsant without phenobarbital’s sleepiness. It was one of the first rational drug screens in neurology."),
    ("valproate-origin", ["valproate", "valproic", "depakote"],
     "Valproic acid was a solvent. In the early 1960s French chemists used it to dissolve candidate anticonvulsants — and the solvent itself stopped seizures. A laboratory accident that became first-line for generalized epilepsy and a teratogenicity caution."),
    ("ethosuximide-absence", ["ethosuximide", "absence", "t-type calcium", "3 hz"],
     "Ethosuximide is almost a one-trick drug: childhood absence, T-type calcium channels in thalamus, 3 Hz spike-and-wave. The 2010 NEJM trial (Glauser) still prefers it over valproate for new absence — fewer attentional side effects."),
    ("ninds-tpa", ["alteplase", "tpa", "t-pa", "thrombolysis", "ninds"],
     "The 1995 NINDS tPA trial put a clock on every “last known well.” 0.9 mg/kg, 10% bolus, treat ischemic stroke as an emergency — the moment neurology borrowed the cardiology stopwatch."),
    ("broca-wernicke-lichtheim", ["lichtheim", "house diagram", "aphasia diagram"],
     "Lichtheim’s 1885 “house” diagram tried to put every aphasia on a set of lines between conceptual centers. It is too neat, and residents still draw it — a Victorian flowchart that refuses to die."),
    ("migraine-wolff", ["migraine", "aura", "cortical spreading", "triptan", "cgrp"],
     "Harold Wolff spent mid-century blaming migraine on extracranial vasodilation. Cortical spreading depression (Leão, 1944; later mapped onto aura) and CGRP-targeted drugs rewrote that story. The throbbing artery was never the whole plot."),
    ("cluster-horton", ["cluster headache", "horton", "suicide headache", "lacrimation", "oxygen"],
     "Bayard Horton described histaminic cephalgia in the 1930s; “cluster” came later. High-flow oxygen as abortive therapy is one of the oddest evidence-based treatments in neurology — a tank, not a pill."),
    ("lp-quincke", ["lumbar puncture", "quincke", "xanthochromia", "opening pressure"],
     "Heinrich Quincke introduced lumbar puncture in 1891. Xanthochromia — bilirubin in spun CSF — remains the quiet way to catch a subarachnoid hemorrhage after the CT has already gone cold."),
    ("area-postrema", ["area postrema", "chemoreceptor trigger", "fourth ventricle", "uncovered"],
     "The area postrema is a naked chemoreceptor on the floor of the fourth ventricle — no blood–brain barrier. That is why so many drugs, and so much uremia, make people vomit before they do anything more subtle."),
    ("mesolimbic-da", ["mesolimbic", "ventral tegmental", "nucleus accumbens", "reward"],
     "Olds and Milner’s 1954 rat self-stimulation work, plus later dopamine recordings, built the mesolimbic “reward” story. It is why every addiction lecture still draws a line from VTA to nucleus accumbens."),
    ("acetylcholine-loewi", ["acetylcholine", "loewi", "vagusstoff", "otto loewi"],
     "Otto Loewi dreamed the experiment in 1921: stimulate a frog heart’s vagus, drip the bath onto a second heart, watch it slow. He named the messenger Vagusstoff; it was acetylcholine — the first neurotransmitter."),
    ("serotonin-rapport", ["serotonin", "5-ht", "rapport", "enterochromaffin"],
     "Serotonin was isolated from serum as a vasoconstrictor (Rapport, Green, Page, 1948) — hence “sero-tonin.” The gut makes most of it; the raphe nuclei make the bit psychiatry cares about."),
    ("gaba-roberts", ["gaba", "gamma-aminobutyric", "inhibitory", "benzodiazepine"],
     "GABA was found in brain in 1950 and ignored as a metabolic curiosity until the 1960s. Benzodiazepines later turned out to be GABA-A positive allosteric modulators — which is why “more inhibition” is still the story of anxiolysis."),
    ("nmda-pcp", ["nmda", "pcp", "ketamine", "phencyclidine", "glutamate"],
     "PCP and ketamine are NMDA-receptor antagonists. The 1990s “PCP model” of psychosis is why ketamine clinics and glutamate hypotheses of schizophrenia share a receptor."),
    ("folic-ntd", ["folic acid", "neural tube", "spina bifida", "valproate neural"],
     "Periconceptional folic acid slashed neural-tube defects after the MRC trial (1991). It is also why valproate’s teratogenicity feels like a cruel joke: a folate-sensitive morphogenesis problem meeting an antifolate-ish drug."),
    ("radial-saturday-night", ["radial nerve", "saturday night", "honeymoon palsy", "wrist drop"],
     "Saturday-night palsy is a radial-nerve compression at the spiral groove after a chair-back, a lover’s arm, or a bender. Wrist drop with triceps spared or not tells you how high the pressure sat."),
    ("mg-ice-pack", ["ice pack test", "myasthenia ptosis"],
     "The ice-pack test for myasthenic ptosis is almost folkloric: two minutes of cold, lid lifts. Cold slows acetylcholinesterase, so more ACh hangs around at the remaining receptors. A paper cup of ice is a bedside assay."),
    ("optic-ms-uhthoff", ["uhthoff", "optic neuritis", "internuclear", "mlf"],
     "Uhthoff’s phenomenon — MS symptoms that flare in heat — was described in 1890 in optic neuritis. A hot shower that blurs vision is still one of the most specific histories you can take."),
    ("ino-mlf", ["internuclear ophthalmoplegia", "medial longitudinal", "adduction failure"],
     "Internuclear ophthalmoplegia is an MLF lesion: the adducting eye will not come in on lateral gaze, the other eye nystagmus. In a young adult it is MS until you finish the sentence; in an older one it is a pontine infarct."),
    ("homunculus-penfield-hands", ["homunculus", "cortical representation"],
     "Penfield’s homunculus looks like a propaganda poster because lips, tongue, and fingers own absurd amounts of cortex. That is why a tiny MCA opercular infarct can wreck the face and hand and spare the leg."),
    ("mca-leg-aca", ["anterior cerebral", "leg weakness", "paracentral"],
     "The ACA–MCA split is a map you can walk: ACA takes the homunculus’s foot (paracentral lobule), MCA takes face and arm. Isolated leg weakness that looks “spinal” is sometimes a midline frontal infarct."),
    ("pca-alexia", ["alexia without agraphia", "splenium", "left pca", "disconnection"],
     "Alexia without agraphia is Déjerine’s 1892 disconnection: a left PCA infarct that also nicks the splenium, so the surviving right visual cortex cannot talk to language cortex. Patients write a sentence they then cannot read."),
    ("kluver-bucy", ["kluver", "bucy", "amygdala", "hyperorality", "hypersexual"],
     "Klüver and Bucy (1939) removed both temporal lobes in monkeys and got hyperorality, hypersexuality, and a loss of fear. Human equivalents after herpes encephalitis are rarer and unforgettable."),
    ("foster-kennedy", ["foster kennedy", "olfactory groove", "ipsilateral optic atrophy", "contralateral papilledema"],
     "Foster Kennedy syndrome — ipsilateral optic atrophy plus contralateral papilledema — is an olfactory-groove meningioma postcard. It is rare now because imaging finds the tumor before the second disc swells."),
    ("foster-ramsay-hunt", ["ramsay hunt", "zoster oticus", "geniculate", "vesicles ear"],
     "Ramsay Hunt (1907) is VZV in the geniculate ganglion: facial palsy plus vesicles in the ear canal. Treat it like zoster, not like ordinary Bell’s — the eponym is a reminder to look in the ear."),
    ("meniere", ["meniere", "endolymphatic", "fluctuating hearing", "vertigo tinnitus"],
     "Prosper Ménière argued in 1861 that some “apoplectiform cerebral congestion” was actually an inner-ear disease. Fluctuating hearing, tinnitus, and episodic vertigo still carry his name."),
    ("benign-parox-bppv", ["bppv", "dix-hallpike", "epley", "canalith", "otoconia"],
     "BPPV is loose otoconia in a semicircular canal. Dix–Hallpike (1952) proves it; Epley’s 1992 particle-repositioning maneuver treats it. One of the few times a bedside dance is first-line therapy."),
    ("romberg-tabes", ["romberg", "dorsal column", "tabes", "proprioception"],
     "Moritz Romberg’s sign came from tabes dorsalis: eyes closed, the dorsal-column patient sways. It is not a cerebellar test. It asks whether vision is substituting for lost proprioception."),
    ("lhermitte", ["lhermitte", "barber chair", "cervical demyelination"],
     "Lhermitte’s sign — electric shocks down the spine on neck flexion — is a stretched, demyelinated dorsal column, classically MS. Patients call it the barber-chair shock."),
    ("kernig-brudzinski", ["kernig", "brudzinski", "meningismus", "nuchal"],
     "Kernig (1882) and Brudzinski (1909) are still taught because meningeal irritation has so few bedside signs. They are insensitive and, when present, hard to ignore."),
    ("uncal-cn3", ["uncal", "transtentorial", "blown pupil", "ipsilateral three"],
     "Uncal herniation compresses ipsilateral III against the tentorial edge — the blown pupil that makes people call a neurosurgeon at 3 a.m. Hutchinson described the dilated pupil of compression in the 1860s."),
    ("cushing-triad", ["cushing triad", "hypertension bradycardia", "irregular respiration"],
     "Harvey Cushing’s triad — hypertension, bradycardia, irregular breathing — is a late brainstem-ischemia warning, not an early ICP screen. Cushing measured it in dogs and then in the operating room."),
    ("glascow-teasdale", ["glasgow", "gcs", "teasdale", "jennett"],
     "The Glasgow Coma Scale (Teasdale & Jennett, 1974) was written so different observers would describe the same head-injured patient. Eye, verbal, motor — a 1970s checklist that became a world language."),
    ("ranchos-los-amigos", ["ranchos", "levels of cognitive"],
     "Rancho Los Amigos levels were written in a California rehab hospital to give families a shared vocabulary for recovery after brain injury — from no response to purposeful, appropriate."),
    ("ct-hounsfield", ["ct scan", "hounsfield", "computed tomography"],
     "Godfrey Hounsfield’s EMI scanner (1971) — funded in part by Beatles royalties — made the living brain visible without air or dye. Neurology changed in a decade more than it had in the previous century."),
    ("mri-lauterbur-mansfield", ["mri", "lauterbur", "mansfield", "t2 hyperintense"],
     "Lauterbur and Mansfield (Nobel 2003) turned NMR into pictures. MS plaques, hippocampal sclerosis, and diffusion-weighted stroke are everyday now; they were science fiction when many faculty were residents."),
    ("nimodipine-sah", ["nimodipine", "subarachnoid", "vasospasm"],
     "Nimodipine after aneurysmal SAH is one of those rare neuro-ICU facts that is both evidence-based and slightly mysterious: it improves outcome more clearly than it prevents angiographic vasospasm."),
    ("carbidopa-periphery", ["carbidopa", "dopa decarboxylase", "peripheral conversion"],
     "Carbidopa does not cross the blood–brain barrier. That is the whole trick: block peripheral decarboxylase, send more levodopa upstairs, keep the nausea downstairs."),
    ("on-off-marsden", ["on-off", "dyskinesia", "motor fluctuation"],
     "C. David Marsden named the on–off phenomenon as levodopa honeymoons ended. The brain that once soaked up every dose starts to behave like a switch — the clinical picture that led to COMT inhibitors, MAO-B inhibitors, and deep-brain stimulation."),
    ("dbs-benabid", ["deep brain stimulation", "dbs", "subthalamic", "benabid"],
     "Alim-Louis Benabid’s Grenoble work in the late 1980s turned a lesioning electrode into a pacemaker for the subthalamic nucleus. Parkinson disease gained a reversible surgery."),
    ("rem-aserton", ["rem sleep", "aserinsky", "kleitman", "dreaming"],
     "Eugene Aserinsky, a graduate student, noticed in 1953 that sleeping subjects’ eyes darted while their EEG woke up. Kleitman and Dement turned that into REM sleep — and the modern architecture of a night."),
    ("narcolepsy-hypocretin", ["narcolepsy", "cataplexy", "hypocretin", "orexin", "hla dqb1"],
     "Narcolepsy with cataplexy is a hypocretin (orexin) cell funeral in the lateral hypothalamus, strongly tied to HLA-DQB1*06:02. A 1990s peptide discovered in appetite research became the sleep-board’s favorite neurotransmitter."),
    ("restless-ekbom", ["restless legs", "ekbom", "urge to move", "ferritin"],
     "Karl-Axel Ekbom described restless legs in 1945. Low ferritin and dopaminergic meds still dominate the chapter — a sensory-motor urge that sounds psychiatric until the legs jump in the chair."),
    ("pick-ftd", ["pick", "frontotemporal", "tau", "tdp-43", "behavioral variant"],
     "Arnold Pick described focal atrophy with personality change in 1892. “Pick’s disease” is now one tauopathy inside a larger frontotemporal family (TDP-43, FUS…). The social disinhibition is still what families notice first."),
    ("vascular-binswanger", ["binswanger", "small vessel", "leukoaraiosis", "strategic infarct"],
     "Otto Binswanger described subcortical vascular dementia in 1894. Hachinski later gave us the ischemic score and the word multi-infarct. A few strategic lesions (thalami, caudate, angular gyrus) can mimic a cortical dementia."),
    ("nph-adams", ["normal pressure hydrocephalus", "hakim", "adams", "wet wacky wobbly"],
     "Adams, Fisher, and Hakim described NPH in 1965: gait, incontinence, cognitive change, ventricles too big for the sulci. The magnetic gait is the part that still makes people consider a shunt."),
    ("delirium-celsus", ["delirium", "waxing waning", "waxing and waning", "celsus"],
     "Celsus used “delirium” in the first century. The modern pearl is still attentional, fluctuating, and medical until proven otherwise — a syndrome older than the hospitals we admit it to."),
    ("achalasia-wait", ["botulinum toxin", "scott", "blepharospasm", "cervical dystonia"],
     "Alan Scott, an ophthalmologist, turned botulinum toxin from a food-poisoning footnote into a medicine for strabismus and blepharospasm in the 1970s–80s. Neurology borrowed it for dystonia, migraine, and sialorrhea."),
    ("triptan-doenijck", ["sumatriptan", "triptan", "5-ht1b", "humphrey"],
     "Sumatriptan (Patrick Humphrey’s Glaxo team, early 1990s) was the first designer 5-HT1B/1D agonist for migraine. It proved Wolff half-right: vessels matter, but so does a receptor you can target."),
    ("oxygen-cluster-kudrow", ["cluster oxygen", "kudrow"],
     "Lee Kudrow popularized high-flow oxygen for cluster headache in the 1980s. A non-drug abortive that works in minutes is still one of the best “gee-whiz” treatments we have."),
    ("edrophonium-osserman", ["edrophonium", "tensilon", "osserman"],
     "The Tensilon (edrophonium) test, associated with Osserman’s myasthenia clinic, is mostly historical now — too many false results and cholinergic crashes. The ice pack and AChR antibodies outlived it."),
    ("oligoclonal-laterre", ["oligoclonal", "csf igg", "isoelectric"],
     "Oligoclonal bands became practical in the 1960s–70s as isoelectric focusing hit clinical labs. They are not specific for MS, but unmatched CSF bands still mean “the central nervous system is making antibody.”"),
    ("west-nile-polio", ["west nile", "asymmetric flaccid", "anterior horn"],
     "West Nile’s poliomyelitis-like syndrome reminded a generation that “polio” is a pattern, not only a virus: asymmetric flaccid paralysis from anterior horn cells, this time flavivirus."),
    ("polio-salk-sabin", ["poliomyelitis", "salk", "sabin", "anterior horn"],
     "Salk’s killed vaccine (1955) and Sabin’s oral one (1960s) made poliomyelitis rare in the U.S. The anterior-horn lesion is why old-polio patients still show up in psychiatry clinics with residual weakness and late deterioration."),
    ("lyme-burgdorferi", ["lyme", "borrelia", "facial palsy child", "erythema migrans"],
     "Lyme disease is named for Old Lyme, Connecticut, after a 1970s cluster of “juvenile rheumatoid arthritis.” Bilateral facial palsy in a child in New England is still a Borrelia tell."),
    ("tethered-filum", ["tethered cord", "filum", "cutaneous stigma", "sacral dimple"],
     "A hairy patch, dimple, or hemangioma over the sacrum can mark a tethered cord. The filum that will not let the conus rise is a pediatric neurosurgery story hiding in a psych-clinic back-pain consult."),
    ("chiari-malformation", ["chiari", "tonsillar herniation", "syrinx"],
     "Hans Chiari classified hindbrain herniations in 1891. Type I — low tonsils, cough headache, sometimes a syrinx — is the one that still walks into adult clinics looking like a migraine variant."),
    ("tuberous-bourneville", ["tuberous sclerosis", "bourneville", "ash leaf", "shagreen", "sega"],
     "Bourneville described tuberous sclerosis in 1880. Ash-leaf spots under a Wood’s lamp, shagreen patches, and SEGA tumors are the dermatologic-to-neurosurgical tour that makes the diagnosis at the door."),
    ("nf1-vonreck", ["neurofibromatosis", "von recklinghausen", "cafe au lait", "lisch"],
     "Von Recklinghausen (1882) put a name on NF1. Café-au-lait macules, Lisch nodules, and optic gliomas are why a skin exam still belongs in a “new psychosis plus headache” workup in a young person."),
    ("sturge-weber", ["sturge-weber", "port wine", "leptomeningeal", "glaucoma"],
     "Sturge–Weber is a port-wine stain in V1 plus leptomeningeal angioma. The face is the MRI preview: if the stain involves the eyelid, think brain and glaucoma, not cosmetics."),
    ("von-hippel", ["von hippel", "lindau", "hemangioblastoma", "pheo"],
     "Von Hippel–Lindau ties cerebellar hemangioblastomas to retinal angiomas, pheo, and renal-cell carcinoma. A young “tumor in the posterior fossa” is sometimes a germline cancer syndrome."),
    ("kayser-fleischer", ["kayser-fleischer", "descemet"],
     "Kayser (1902) and Fleischer (1903) saw copper rings in Descemet’s membrane before Wilson had a disease named. A slit lamp can still beat a ceruloplasmin."),
    ("kernicterus", ["kernicterus", "bilirubin", "globus pallidus", "athetoid cp"],
     "Kernicterus is bilirubin staining of the globus pallidus and subthalamic nucleus — the reason every pediatrician treats jaundice so aggressively. The athetoid cerebral palsy it leaves is a monument to a preventable toxin."),
    ("lead-wrist-drop-neuro", ["lead poisoning", "wrist drop lead", "basophilic stippling"],
     "Victorian lead palsy was a bilateral wrist drop in painters and cider drinkers. Basophilic stippling and a lead line on the gums are antique signs of a metal that still hides in paint and pipes."),
    ("mnemonic-midbrain-weber-benedikt", ["benedikt", "red nucleus", "claude syndrome"],
     "Midbrain eponyms are a stack of postcards: Weber (peduncle + III), Benedikt (red nucleus + III, tremor), Claude (cerebellar peduncle + III). They exist so we can localize a tiny infarct without an MRI in our heads."),
    ("pons-locked-in", ["locked-in", "ventral pons", "vertical eye", "plum and posner"],
     "Locked-in syndrome is a ventral pontine lesion that spares the tegmentum: awake, quadriplegic, able to look up. Plum and Posner made the distinction from coma a moral as well as anatomic act."),
    ("medulla-desimone", ["medial medullary", "pyramid", "medial lemniscus", "hypoglossal"],
     "Medial medullary (Dejerine) syndrome is pyramid + medial lemniscus + XII — contralateral body weakness and proprioceptive loss, ipsilateral tongue. A tiny anterior spinal artery lesion with a huge eponym."),
    ("spinal-brown-sequard", ["brown-sequard", "hemicord", "ipsilateral motor", "contralateral pain"],
     "Charles-Édouard Brown-Séquard (1850s) cut hemicords and mapped ipsilateral motor/proprioceptive loss with contralateral pain/temperature. A knife fight taught tract anatomy."),
    ("spinothalamic-lateral", ["lateral spinothalamic", "pain temperature", "anterolateral"],
     "The lateral spinothalamic tract crosses within a couple of levels — which is why a hemicord lesion loses pain and temperature a little below and opposite the cut. Brown-Séquard made that crossing famous."),
    ("dorsal-column-ml", ["dorsal column", "fasciculus gracilis", "cuneatus", "vibration"],
     "Gracilis is legs, cuneatus is arms — a map you can remember because graceful dancers lead with their feet. Vibration and joint-position ride those columns to the medulla and then decussate as internal arcuate fibers."),
    ("cauda-vs-conus", ["cauda equina", "conus medullaris", "saddle anesthesia"],
     "Conus lesions are often symmetric and mix upper- and lower-motor signs; cauda equina is painful, asymmetric, and purely lower-motor. Saddle anesthesia is the shared emergency — both need a midnight MRI."),
    ("myotonia-thomsen", ["myotonia", "thomsen", "steinert", "cannot let go"],
     "Thomsen described congenital myotonia in his own family in 1876; Steinert described myotonic dystrophy in 1909. A handshake that will not let go is still the cheapest genetic test in the room."),
    ("periodic-paralysis", ["hypokalemic periodic", "thyrotoxic periodic", "cannot move morning"],
     "Hypokalemic periodic paralysis was characterized in the 1930s; the thyrotoxic Asian-male variant still walks into EDs after a heavy carbohydrate meal. Potassium and thyroid are the two labs that turn a “conversion” story into a channelopathy."),
    ("lambert-increment", ["incremental response", "high frequency stimulation", "50 hz"],
     "The EMG signature of Lambert–Eaton is facilitation at high-frequency stimulation — the electrical version of “gets stronger with use.” Myasthenia does the opposite. The tracing is the eponym."),
    ("tensilon-history", ["mary walker miracle", "physostigmine myasthenia"],
     "Mary Walker’s 1934 physostigmine injection at St. Alfege’s Hospital was photographed: a myasthenic face waking up in minutes. Residents still learn the ice-pack test as her experiment’s safer grandchild."),
    ("cluster-circadian", ["circadian cluster", "hypothalamus cluster", "alarm clock headache"],
     "Cluster cycles are so clock-like that PET studies light up the posterior hypothalamus. Patients set their lives by the 2 a.m. attack. That circadian stamp is why we believe this pain is central, not “just a sinus.”"),
    ("hypnic-headache", ["hypnic", "alarm-clock headache", "awakens from sleep", "awaken patients from sleep", "nocturnal headache"],
     "Hypnic headache — the “alarm-clock” headache of older adults — is one of the few primaries that reliably wakes people from sleep. Cluster, sleep apnea, and nocturnal seizures share that party trick; tension-type headache almost never does."),
    ("ihs-thunderclap", ["thunderclap", "subarachnoid first", "worst headache"],
     "“First, worst, thunderclap” became dogma after too many SAHs were sent home as migraine. A headache that hits maximum intensity in a minute is a vascular emergency until the pigment (xanthochromia) says otherwise."),
    ("idiopathic-ih", ["idiopathic intracranial", "pseudotumor", "dandy", "acetazolamide"],
     "“Pseudotumor cerebri” was Dandy’s 1937 name for high pressure with no mass. We now say idiopathic intracranial hypertension and look for the young woman with papilledema whose opening pressure explains the pulsatile tinnitus."),
    ("acetazolamide-csf", ["acetazolamide", "carbonic anhydrase csf"],
     "Acetazolamide slows choroid-plexus CSF production via carbonic anhydrase. That is why it shows up in IIH, some CSF leaks’ opposite numbers, and altitude sickness — one enzyme, three chapters."),
    ("tpa-window-ecass", ["4.5 hour", "ecass", "alteplase window"],
     "ECASS III (2008) nudged the alteplase window from 3 to 4.5 hours for many patients. Every later “last known well” argument still starts from those two clocks."),
    ("endovascular-mr-clean", ["mr clean", "thrombectomy", "large vessel occlusion"],
     "2015 was the year endovascular thrombectomy became real (MR CLEAN and friends). A stent retriever in an M1 can undo a whole MCA syndrome — the first time stroke looked like a plumbing problem we could actually unclog."),
    ("fast-campaign", ["face arm speech", "fast stroke"],
     "FAST (Face, Arm, Speech, Time) came out of UK public-health work in the mid-2000s. It is not a score; it is a script that gets strangers to call 911 before the penumbra dies."),
    ("nihss-brott", ["nihss", "stroke scale"],
     "The NIH Stroke Scale was standardized in the late 1980s so trialists would speak one language. A number that fits on a code-pager now decides tPA, thrombectomy, and where the patient sleeps."),
    ("xanthochromia-oxyhb", ["oxyhemoglobin", "bilirubin csf", "spectrophotometry"],
     "Xanthochromia takes hours to appear because it is bilirubin, not just blood. That is why a very early LP can be falsely reassuring, and why spectrophotometry beats the naked-eye “is it yellow?” argument."),
    ("oligoclonal-unmatched", ["unmatched bands", "serum pairing"],
     "Always send paired serum. Oligoclonal bands that are also in blood are a systemic story; unmatched CSF bands mean the brain is running its own humoral shop."),
    ("ms-swedbank-mcdonald", ["mcdonald criteria", "dissemination in time", "o'connor", "thompson"],
     "Poser then McDonald criteria turned MS from a wait-and-see diagnosis into MRI + CSF arithmetic: dissemination in space and time. Each revision (2001, 2010, 2017) stole a bit more time from “possible MS.”"),
    ("natalizumab-pml", ["natalizumab", "tysabri", "pml", "jc virus"],
     "Natalizumab’s 2004–05 PML cluster taught a generation that a beautiful anti-trafficking drug can unmask JC virus. The risk algorithm (serostatus, duration, prior immunosuppression) is a living ethics case."),
    ("interferon-ms-ifnb", ["interferon beta", "betaseron", "abc drugs"],
     "Betaseron (1993) was the first disease-modifying MS drug. The ABC era (Avonex, Betaseron, Copaxone) looks quaint next to B-cell depletion — and it was the first time we told patients we could change the slope."),
    ("glatiramer-teitelbaum", ["glatiramer", "copaxone", "copolymer 1"],
     "Glatiramer acetate began as “copolymer 1,” a failed attempt to mimic myelin basic protein and induce EAE. It did the opposite. A laboratory wrong turn that became a daily injection for a generation."),
    ("fumarate-psoriasis", ["dimethyl fumarate", "tecfidera", "flushing"],
     "Dimethyl fumarate was a German psoriasis remedy long before Tecfidera. The flushing and GI upset are old dermatology side effects wearing a new neurology label."),
    ("sleep-von-economo", ["encephalitis lethargica", "von economo", "hypothalamic sleep"],
     "Constantin von Economo’s encephalitis lethargica (1916–27) carved sleep–wake anatomy out of an epidemic: posterior hypothalamic lesions made people sleep; anterior ones wrecked sleep. Oliver Sacks’s Awakenings patients were that epidemic’s late echo."),
    ("modafinil-narcolepsy", ["modafinil", "provigil", "eugeroic"],
     "Modafinil came out of 1970s–80s French military/adrafanil chemistry as a “eugeroic” — wake-promoting without classic amphetamine bounce. Narcolepsy clinics adopted it; everyone else followed."),
    ("melatonin-pineal", ["melatonin", "pineal", "dim light"],
     "Melatonin is the pineal’s darkness hormone. Lerner isolated it in 1958 from bovine pineals. Circadian psychiatry still hangs on that one molecule and a dim-light melatonin-onset curve."),
    ("rem-behavior-schenck", ["rem behavior", "rbd", "schenck", "synucleinopathy"],
     "Schenck described REM sleep behavior disorder in 1986: people acting out dreams because atonia failed. Decades later it is one of the strongest prodromes of a synucleinopathy we have."),
    ("plms-symonds", ["periodic limb", "plms", "plmd"],
     "Periodic limb movements were filmed long before they were named. They fragment sleep, travel with restless legs, and still make bed partners better historians than the sleeper."),
    ("osa-guilleminault", ["obstructive sleep apnea", "guilleminault", "cpap", "sullivan"],
     "Guilleminault defined the OSA syndrome in the 1970s; Sullivan’s 1981 CPAP paper turned a tracheostomy disease into a mask disease. Psychiatry inherited the cognitive and mood fog that a night of obstruction leaves."),
    ("klein-levin", ["kleine-levin", "hypersomnia teenager", "hyperphagia sleep"],
     "Kleine–Levin is the sleeping-beauty syndrome: weeks of hypersomnia, hyperphagia, and derealization in an adolescent, then a bewildering return to normal. First clustered as a syndrome in the 1920s–30s."),
    ("fatal-familial-insomnia", ["fatal familial insomnia", "prion thalamus", "prnp"],
     "Fatal familial insomnia (Lugaresi, 1986) is a prion disease of the thalamus that steals sleep and then life. It is the darkest proof that sleep is not optional tissue maintenance."),
    # --- psychotherapy history ---
    ("anna-o-breuer", ["anna o", "bertha pappenheim", "cathartic", "chimney sweeping"],
     "Anna O. (Bertha Pappenheim) and Breuer’s “chimney sweeping” (1880–82) is the origin myth of talking therapy. The case is messier than the textbook — she was not simply cured by recollection — but it is why Freud had a method to invent."),
    ("freud-transference-dora", ["transference", "dora", "1905 fragment"],
     "Freud named transference as a technical problem in the 1905 Dora fragment: the patient repeats an old object-tie with the analyst instead of remembering it. Every later school is an argument about what to do when that happens."),
    ("freud-countertransference-1910", ["countertransference", "freud 1910"],
     "Freud coined countertransference in 1910 and first treated it as the analyst’s unanalyzed residue — a contaminant. Later generations flipped it into data. The word is the same; the attitude is not."),
    ("wednesday-society", ["wednesday psychological", "vienna psychoanalytic"],
     "The Wednesday Psychological Society met in Freud’s waiting room from 1902. Stekel, Adler, Rank, and later Jung turned a journal club into a movement — and then into schisms."),
    ("jung-split-1913", ["jung", "collective unconscious", "archetype", "word association"],
     "Jung’s 1913 break with Freud was about libido, religion, and who owned the unconscious. Word-association experiments and complexes are Jung’s laboratory leftovers inside today’s trauma vocabulary."),
    ("adler-inferiority", ["adler", "inferiority", "individual psychology", "birth order"],
     "Alfred Adler left Freud in 1911 and built Individual Psychology around inferiority, striving, and birth order. A lot of “self-esteem” talk is Adler in American clothing."),
    ("klein-object-play", ["klein", "paranoid-schizoid", "depressive position", "splitting klein"],
     "Melanie Klein watched children play and concluded that splitting, projection, and a harsh early superego start in infancy. The paranoid-schizoid and depressive positions (1940s) are still the grammar of object-relations."),
    ("bion-container", ["bion", "container-contained", "alpha function", "reverie"],
     "Wilfred Bion, a tank commander before he was an analyst, described the therapist as a container that metabolizes nameless dread into thinkable feeling (1962). “Reverie” is his word for that digestive work."),
    ("winnicott-holding", ["winnicott", "holding environment", "transitional object", "good-enough", "true self"],
     "Donald Winnicott’s good-enough mother, holding environment, and transitional object (1951–60s) gave ordinary pediatric observation to psychoanalysis. The teddy bear is a theory."),
    ("fairbairn-object", ["fairbairn", "bad object", "libido seeking"],
     "W. R. D. Fairbairn flipped Freud: libido seeks objects, not discharge. The child internalizes a bad object rather than live without one. That sentence still explains why people protect their worst relationships."),
    ("kohut-self", ["kohut", "self psychology", "mirroring", "idealizing", "narcissistic rage"],
     "Heinz Kohut (1971, 1977) argued that some patients need mirroring and idealizing selfobjects, not drive interpretation. Narcissistic rage, in his hands, is a fragmenting self, not just aggression."),
    ("kernberg-tfp", ["kernberg", "tfp", "transference-focused", "borderline organization"],
     "Otto Kernberg built a map of borderline personality organization and then a treatment (TFP) that treats split-off object relations in the transference, twice a week, with a contract. Identity diffusion is the center, not the fifth DSM criterion."),
    ("linehan-dbt", ["linehan", "dbt", "dialectical", "wise mind", "chain analysis"],
     "Marsha Linehan said publicly in 2011 what colleagues had guessed: she built DBT from her own history of self-harm. The dialectic — acceptance and change — is a philosopher’s word doing clinical work."),
    ("beck-cbt-1960s", ["beck", "automatic thought", "cognitive triad", "cbt"],
     "Aaron Beck, a psychoanalyst, started writing down his patients’ thoughts in the 1960s and found a depressogenic triad: self, world, future. CBT was born as a disappointed analysis, not as an attack on it."),
    ("ellis-rebt", ["ellis", "rebt", "musturbation", "irrational belief"],
     "Albert Ellis was doing REBT in the mid-1950s — before Beck’s manuals — with a New Yorker’s vocabulary (“musturbation”). The ABC model (Activating event, Belief, Consequence) is still every CBT whiteboard."),
    ("wolpe-desensitization", ["wolpe", "systematic desensitization", "reciprocal inhibition"],
     "Joseph Wolpe (1958) paired relaxation with graded phobic images and called it reciprocal inhibition. Exposure therapy’s gentler grandparent — and a reminder that fear can be unlearned in the office."),
    ("skinner-operant", ["skinner", "operant", "reinforcement", "token economy"],
     "B. F. Skinner’s operant chamber made consequences the independent variable. Token economies and behavioral activation are clinic-level Skinner: change the contingencies, watch the behavior move."),
    ("lewinsohn-ba", ["behavioral activation", "lewinsohn", "activity schedule", "avoidance depression"],
     "Peter Lewinsohn’s behavioral model of depression (1970s) said low response-contingent positive reinforcement is the engine. Modern BA (Jacobson, Martell) dropped a lot of cognitive furniture and kept the schedule."),
    ("hayes-act", ["hayes", "act", "experiential avoidance", "psychological flexibility", "hexaflex"],
     "Steven Hayes developed ACT in the 1980s from behavior analysis plus a personal history of panic. Experiential avoidance — organizing a life around not feeling something — is the process the veteran-in-the-stem is usually running."),
    ("miller-rollnick-mi", ["motivational interviewing", "rollnick", "change talk", "oars", "ambivalence"],
     "William Miller noticed in the 1980s that empathy plus evocation beat confrontation for drinkers. With Stephen Rollnick he named Motivational Interviewing. Ambivalence is the raw material, not the enemy."),
    ("klerman-ipt", ["ipt", "klerman", "weissman", "interpersonal inventory", "role transition"],
     "Gerald Klerman and Myrna Weissman built IPT in the 1970s as the structured psychotherapy arm of a pharmacotherapy trial. Four foci (grief, dispute, transition, deficit) and a time limit — depression as a social illness."),
    ("bateman-fonagy-mbt", ["mentalization", "mbt", "bateman", "fonagy", "pretend mode", "psychic equivalence"],
     "Bateman and Fonagy’s MBT grew out of attachment research: borderline suffering as a failure to hold mind in mind, especially under arousal. Psychic equivalence and pretend mode are the two ditches on either side of mentalizing."),
    ("yalom-factors", ["yalom", "universality", "cohesion", "existential factors", "corrective recapitulation"],
     "Irvin Yalom listed eleven therapeutic factors in group therapy (1970/1975). Universality — “I am not the only one” — is the one veterans and shame-ridden residents feel in the room before anyone interprets anything."),
    ("bowlby-attachment", ["bowlby", "attachment", "secure base", "protest despair detachment"],
     "John Bowlby, a psychoanalyst who actually watched separated children, described protest–despair–detachment and the secure base (1950s–80s). Ainsworth’s Strange Situation later made the patterns visible in twenty minutes."),
    ("ainsworth-strange", ["ainsworth", "strange situation", "secure avoidant", "ambivalent", "disorganized"],
     "Mary Ainsworth’s Strange Situation (1978) is an eight-episode play that sorts attachment into secure, avoidant, resistant — and, later, Main and Solomon’s disorganized. A laboratory drama that became a clinical language."),
    ("main-disorganized", ["disorganized attachment", "mary main", "fright without solution"],
     "Mary Main’s disorganized attachment is “fear without a solution”: the caregiver is both haven and threat. It is the developmental sentence that most cleanly previews later dissociative and borderline pictures."),
    ("sullivan-interpersonal", ["sullivan", "participant observer", "parataxic", "interpersonal psychiatry"],
     "Harry Stack Sullivan treated schizophrenia as an interpersonal disease and sat as a “participant observer.” Parataxic distortion — mixing the person in front of you with an old figure — is transference in American idiom."),
    ("ferenczi-mutual", ["ferenczi", "mutual analysis", "confusion of tongues", "trauma ferenczi"],
     "Sándor Ferenczi’s “Confusion of Tongues” (1932) argued that real trauma, not only fantasy, organizes some pathology — and that the analyst’s hypocrisy reenacts it. He was ostracized; trauma theory later moved in with him."),
    ("lacan-mirror", ["lacan", "mirror stage", "objet petit a", "the real"],
     "Lacan’s 1936/1949 mirror stage is the toddler who falls in love with a coherent image that is not how the body feels. A lot of later “self” talk is a fight with, or a footnote to, that essay."),
    ("foa-pe", ["prolonged exposure", "foa", "emotional processing", "in vivo exposure", "imaginal"],
     "Edna Foa’s prolonged exposure (1980s–90s) treats PTSD as failed emotional processing: the memory stays hot because it is avoided. Imaginal plus in vivo is the opposite of “don’t make them talk about it.”"),
    ("resick-cpt", ["cognitive processing", "resick", "stuck points", "impact statement"],
     "Patricia Resick’s CPT began with rape survivors in the 1980s. Stuck points — “It was my fault,” “Nowhere is safe” — are the cognitive residue of trauma. Writing an impact statement is the first exposure."),
    ("shapiro-emdr", ["emdr", "shapiro", "bilateral stimulation", "desensitization reprocessing"],
     "Francine Shapiro noticed in 1987 that saccadic eye movements seemed to loosen distressing thoughts on a walk. EMDR is still argued about as mechanism and widely used as method."),
    ("meichenbaum-stress", ["meichenbaum", "stress inoculation", "self-instruction"],
     "Donald Meichenbaum’s stress-inoculation training (1970s) taught people to talk to themselves on purpose. Coping thoughts as a skill, not a personality trait."),
    ("young-schema", ["schema therapy", "young", "early maladaptive schema", "limited reparenting"],
     "Jeffrey Young’s schema therapy folded CBT into attachment and mode work for people who bounced off short-term manuals. “Limited reparenting” is the phrase that makes purists wince and patients stay."),
    ("linehan-validation", ["validation db t", "levels of validation", "reciprocal communication"],
     "Linehan’s six levels of validation run from staying awake to radical genuineness. Level 4 — “anyone would feel that way” — is the one that often stops a session from becoming a skills lecture."),
    ("dbt-biosocial", ["biosocial", "invalidating environment", "emotional vulnerability"],
     "The biosocial model says a sensitive temperament plus an invalidating environment produces the dysregulated adult. It is a developmental story, not a character assassination — which is why it works as psychoeducation."),
    ("dialectic-hegel-linehan", ["dialectic", "thesis antithesis"],
     "Linehan borrowed “dialectic” from philosophy (and from her Zen teachers): two opposite things can both be true. You are doing the best you can, and you have to do better. That sentence is the treatment."),
    ("mi-spirit", ["mi spirit", "partnership evocation", "righting reflex"],
     "The spirit of MI is partnership, evocation, acceptance, compassion. The “righting reflex” — the urge to fix — is the thing the resident has to notice in their own chest before they can hear change talk."),
    ("darn-cat", ["darn cat", "preparatory change talk", "mobilizing change"],
     "DARN CAT is MI’s mnemonic: Desire, Ability, Reasons, Need (preparatory) and Commitment, Activation, Taking steps (mobilizing). You reinforce the grammar of change rather than installing it."),
    ("ipt-sick-role", ["sick role", "parsons", "ipt medical model"],
     "IPT explicitly gives the patient a sick role (Parsons, 1951): depression is an illness, not a moral failure. That one frame often does more in session one than a clever interpretation."),
    ("klerman-boston-newhaven", ["new haven-boston", "collaborative study psychotherapy"],
     "IPT was manualized so it could be a fair comparator in the NIMH Treatment of Depression Collaborative Research Program. A therapy invented to be a control became a first-line treatment."),
    ("mbt-attachment-arousal", ["arousal mentalizing", "unmentalized"],
     "MBT’s practical rule is simple: as arousal goes up, mentalizing goes down. Slow the session, name affect, and ask what is in the other person’s mind before you interpret content."),
    ("tfp-contract", ["tfp contract", "treatment contract", "frame tfp"],
     "TFP starts with a contract that names suicidality, attendance, and moonlighting treatments. The frame is not fussiness — it is the first interpretation of how this particular pair will try to destroy the work."),
    ("supportive-dewald", ["supportive psychotherapy", "ego strengthening", "dewald"],
     "Supportive therapy was the unglamorous twin of expressive work for decades (Dewald and others). Strengthen defenses that work, do not dismantle ones the patient still needs — a skill, not a consolation prize."),
    ("alliance-borodin-greenson", ["working alliance", "greenson", "borodin", "bond task goal"],
     "Greenson’s working alliance and Bordin’s later bond–task–goal triad (1979) are why “relationship” is not a vague vibe. Meta-analyses keep finding the alliance as a robust, non-brand-specific predictor."),
    ("safran-muran-rupture", ["rupture repair", "safran", "muran", "withdrawal confrontation"],
     "Safran and Muran made rupture-and-repair a research object: withdrawal and confrontation ruptures, then the messy work of talking about what just happened. The repair, not the perfect alliance, predicts outcome."),
    ("gabbard-boundaries", ["gabbard", "boundary crossing", "boundary violation", "slippery slope"],
     "Glen Gabbard’s writing on crossings versus violations gave ethics a clinical vocabulary. A crossing can be discussed; a violation exploits. The slope between them is how careers (and patients) get wrecked."),
    ("gutheil-gabbard-frame", ["frame gutheil", "role boundary"],
     "Gutheil and Gabbard (1993) distinguished boundary crossings from violations in print. The paper is assigned in every ethics seminar because the cases still sound current."),
    ("peplau-interpersonal-nursing", ["peplau", "nurse-patient", "interpersonal relations nursing"],
     "Hildegard Peplau’s Interpersonal Relations in Nursing (1952) imported Sullivan into American psychiatric nursing. A lot of “therapeutic use of self” talk starts there."),
    ("rogers-conditions", ["rogers", "unconditional positive regard", "accurate empathy", "congruence"],
     "Carl Rogers’s 1957 necessary-and-sufficient conditions — empathy, congruence, unconditional positive regard — are still the control group that every brand has to beat, and often cannot."),
    ("frankl-logotherapy", ["frankl", "logotherapy", "will to meaning", "man search"],
     "Viktor Frankl drafted logotherapy before and during Auschwitz; Man’s Search for Meaning (1946) made “will to meaning” a popular psychology that still belongs in existential work with medically ill patients."),
    ("yalom-four-givens", ["existential yalom", "death freedom isolation", "meaninglessness"],
     "Yalom’s four givens — death, freedom, isolation, meaninglessness — are the existential curriculum. Group and individual work that names them often feels more honest than a protocol that will not."),
    ("minuchin-structural", ["minuchin", "structural family", "enmeshment", "joining"],
     "Salvador Minuchin’s structural family therapy (1970s) treated anorexia and chaos by changing seating, boundaries, and who talks to whom. Joining, then unbalancing — family work as choreography."),
    ("bowen-differentiation", ["bowen", "differentiation of self", "triangles", "multigenerational"],
     "Murray Bowen watched his own family and then everyone else’s: triangles, fusion, differentiation of self. A genogram is Bowen’s instrument hanging on the consult-room wall."),
    ("satir-communication", ["satir", "family sculpting", "communication stances"],
     "Virginia Satir’s sculpting and communication stances (blamer, placater, computer, distracter) gave family therapy a theater. Residents remember the poses after they forget the chapter."),
    ("whitaker-symbolic", ["whitaker", "symbolic experiential"],
     "Carl Whitaker treated the family as a living organism and used himself as a chaotic catalyst. Not a manual. A reminder that dead-serious families sometimes need a court jester with a license."),
    ("haley-strategic", ["haley", "strategic therapy", "paradoxical", "ordeal"],
     "Jay Haley’s strategic therapy assigned ordeals and paradoxes. “Prescribe the symptom” still shows up when a power struggle is the real identified patient."),
    ("bateson-double-bind", ["double bind", "bateson", "palo alto"],
     "Bateson’s double-bind hypothesis (1956) blamed schizophrenia on no-win communication. The etiology did not hold; the description of impossible messages still helps families and staff see what they are doing."),
    ("seligman-helplessness", ["learned helplessness", "seligman", "attributional style"],
     "Martin Seligman’s dogs (1967) that stopped jumping became a model of depression — and then a model of explanatory style. Later positive psychology is the same lab turning the variables over."),
    ("beck-hopelessness", ["hopelessness scale", "beck suicide"],
     "Beck’s hopelessness work tied a cognitive construct to suicide risk more tightly than sad mood alone. “The future is blank” is still the sentence that should change your evening plan."),
    ("linehan-phone-coaching", ["phone coaching", "in vivo skills", "24 hour rule"],
     "DBT phone coaching exists so skills get used at 11 p.m., not only described at 3 p.m. The 24-hour rule after self-harm protects the therapist from reinforcing the behavior the treatment is trying to retire."),
    ("chain-analysis-dbt", ["chain analysis", "vulnerability factors", "prompting event"],
     "A DBT chain analysis is a behavioral autopsy: vulnerability factors, prompting event, links, consequences. It is Skinner plus compassion, written so a patient can see the movie instead of only the last frame."),
    ("act-hexaflex", ["defusion", "self-as-context", "valued action", "hexaflex"],
     "ACT’s hexaflex — acceptance, defusion, present moment, self-as-context, values, committed action — is one process (psychological flexibility) drawn as six petals. The veteran avoiding highways is usually failing more than one petal."),
    ("defusion-milk-milk", ["milk milk milk", "defusion exercise"],
     "Hayes’s “milk, milk, milk” exercise (say a word until it becomes noise) is defusion you can do in a chair. Thoughts are language events, not orders. Boards love the idea; patients remember the word going silly."),
    ("exposure-habituation-vs-inhibitory", ["inhibitory learning", "craske", "habituation exposure"],
     "Michelle Craske’s inhibitory-learning rewrite of exposure says the old fear association is not erased; a new “this is safe” memory competes with it. That is why variability, violation of expectancies, and retrieval cues matter more than a pretty SUDS curve."),
    ("wolpe-suds", ["suds", "subjective units", "wolpe scale"],
     "SUDS — Subjective Units of Disturbance — is Wolpe’s 1969 scale. A 0–100 feeling given a number so two people can watch fear move. Every exposure hierarchy still borrows it."),
    ("freud-dream-1900", ["dream work", "condensation", "displacement", "wish fulfillment"],
     "The Interpretation of Dreams (1900) made condensation, displacement, and wish-fulfillment household ideas. Even therapists who never interpret a dream still use those verbs for how the unconscious edits."),
    ("freud-repetition", ["repetition compulsion", "beyond pleasure", "1920"],
     "Beyond the Pleasure Principle (1920) introduced the repetition compulsion — the puzzling return to unpleasure. Trauma theory and transference both still spend that coin."),
    ("defense-anna-freud", ["anna freud", "ego and mechanisms", "defense mechanism"],
     "Anna Freud’s The Ego and the Mechanisms of Defence (1936) catalogued the ego’s repertoire. Mature versus primitive is still how we talk about whether a defense buys time or costs a life."),
    ("vaillant-hierarchy", ["vaillant", "mature defenses", "sublimation altruism", "suppression humor"],
     "George Vaillant followed Harvard men for decades and ranked defenses by adaptiveness. Sublimation, altruism, suppression, humor at the top — a longitudinal argument that style of defense predicts a life."),
    ("splitting-kernberg-klein", ["splitting", "all good all bad", "object relations split"],
     "Splitting, from Klein via Kernberg, is the failure to hold good and bad in one object. The staff-splitting on a borderline unit is not a metaphor — it is the defense enacted in the milieu."),
    ("projective-identification", ["projective identification", "klein pi"],
     "Klein’s projective identification is more than dumping a feeling: the other person starts to live it. When the resident feels an inexplicable urge to reject or rescue, they may be holding something that was never put into words."),
    ("enactment-renik", ["enactment", "renik", "jacobs", "two-person"],
     "Jacobs, McLaughlin, and Renik helped move analysis from “blank screen” to two-person psychology: enactments are inevitable, and talking about them is the work. The pair will act it before they can say it."),
    ("two-person-hoffman", ["two-person", "social constructivist", "hoffman", "mitchell"],
     "Relational analysts (Mitchell, Hoffman, Aron) treated the therapist’s subjectivity as data, not noise. The “correct” interpretation lost some glamour; the honest relationship gained it."),
    ("medication-alliance", ["meaning of medication", "pills transference", "split treatment"],
     "From the 1990s split-treatment literature (psychiatrist plus therapist) came a durable fact: the pill is also an object. Who gives it, who resents it, and what it means in the transference can decide adherence."),
    ("placebo-beecher", ["placebo", "beecher", "meaning response"],
     "Henry Beecher’s 1955 “The Powerful Placebo” (flawed, famous) forced medicine to admit that meaning heals. In psychotherapy research the alliance often swallows the specific-ingredient variance — a clinical humility, not a nihilism."),
    ("dodo-luborsky", ["dodo bird", "luborsky", "common factors", "rosenzweig"],
     "Rosenzweig (1936) then Luborsky’s “dodo bird verdict” said most bona fide therapies win by similar margins. Common factors research is the polite way of saying relationship, expectancy, and getting to work matter."),
    ("empirically-supported-chambless", ["empirically supported", "chambless", "division 12"],
     "Division 12’s empirically supported treatments lists (1990s, Chambless) forced psychotherapy to name its evidence. The lists started wars and also made residents learn a CBT protocol before improvising."),
    ("nami-family", ["psychoeducation family", "nami", "expressed emotion"],
     "High expressed emotion (Brown, Vaughn) predicted schizophrenia relapse; family psychoeducation and NAMI (1979) turned that finding into a movement. Warmth without criticism is a relapse-prevention drug."),
    ("assertive-stein-test", ["assertive community", "stein and test", "act team"],
     "Stein and Test’s assertive community treatment (1970s, Madison) moved the hospital into the street: a team, a small caseload, 24-hour responsibility. It is still the model when “just give them an appointment” is a fantasy."),
    ("token-atthowe", ["token economy", "ayllon", "azrin", "atthowe"],
     "Ayllon and Azrin’s token economy at Anna State Hospital (1960s) made operant principles institutional. Controversial, powerful, and the ancestor of every sticker chart on a child unit."),
    ("milieu-jones", ["therapeutic community", "maxwell jones", "milieu"],
     "Maxwell Jones’s therapeutic community (1940s–50s) treated the ward as the treatment. Community meetings are not filler — they are the intervention, when they work."),
    ("moral-treatment-pinel", ["pinel", "tuke", "moral treatment", "bicêtre"],
     "Pinel at Bicêtre and the Tukes at York Retreat (late 1700s) replaced chains with moral treatment. Every later “least restrictive” argument is a footnote to that moment, including the ones we still fail."),
    ("freud-couch-topography", ["free association", "fundamental rule", "couch"],
     "The couch and the fundamental rule (say whatever comes to mind) were technical answers to resistance. They are also Victorian furniture that still signals: here, speech is the experiment."),
    ("greenson-working-through", ["working through", "greenson technique"],
     "Working through is Freud’s phrase for the unglamorous repetitions after insight. Greenson wrote the modern technique book; the idea is that one good interpretation is a start, not a cure."),
    ("strachey-mutative", ["mutative interpretation", "strachey 1934"],
     "James Strachey’s 1934 paper on the mutative interpretation argued that change happens when the analyst is experienced as a new object in the same old transference storm. A single paper that still defines “why this interpretation, now.”"),
    ("loewald-new-object", ["loewald", "new object", "ghosts in nursery"],
     "Hans Loewald (1960) described analysis as making ghosts in the nursery into ancestors — old objects that can be remembered instead of relived. Fraiberg later used the ghost image for parent-infant work."),
    ("fraiberg-ghosts", ["ghosts in the nursery", "fraiberg", "parent infant"],
     "Selma Fraiberg’s “Ghosts in the Nursery” (1975) showed how a parent’s unremembered past stands between them and the baby. Infant mental health starts with that haunting."),
    ("ainsworth-secure-base-therapy", ["secure base therapy", "attachment informed"],
     "Bowlby eventually said the therapist is a secure base from which the patient’s story can be explored. Attachment-informed work is that sentence with a coding system attached."),
    ("fonagy-reflective", ["reflective functioning", "rfs", "parental mentalization"],
     "Fonagy’s reflective functioning is the parent’s (or therapist’s) capacity to treat behavior as meaningful in terms of mind. It is measurable, teachable, and one of the better bridges between attachment research and the hour."),
    ("beutler-aptitude", ["aptitude treatment", "beutler", "reactance"],
     "Larry Beutler’s aptitude-by-treatment work showed that high-reactance patients do worse with directive styles. Matching stance to person is older than any brand war."),
    ("prochaska-stages", ["precontemplation", "contemplation", "prochaska", "stages of change"],
     "Prochaska and DiClemente’s stages of change (1980s) gave MI and addiction a shared map. Precontemplation is not stupidity — it is a stage. Argue with it and you lose the next one."),
    ("marlatt-relapse", ["marlatt", "relapse prevention", "abstinence violation"],
     "G. Alan Marlatt’s relapse prevention (1985) named the abstinence-violation effect: one lapse becomes a binge because of shame. “A lapse is data” is still the line that keeps people in treatment."),
    ("miller-drinkers-check", ["drinker's check-up", "motivational feedback"],
     "Miller’s Drinker’s Check-Up showed that structured, empathic feedback could cut drinking without a full program. Brief intervention research starts there."),
    ("project-match", ["project match", "matching hypothesis addiction"],
     "Project MATCH (1990s) tried to match alcohol patients to CBT, TSF, or MET and mostly found that all three worked. Matching was weaker than hoped; decent therapy was stronger."),
    ("twelve-step-wilson", ["aa", "bill w", "bob smith", "twelve step"],
     "Bill Wilson and Dr. Bob Smith founded AA in 1935. Twelve-step facilitation is the clinical handshake with that lay movement — not the same as sending someone to a church basement and hoping."),
    ("ipt-grief-focus", ["complicated grief ipt", "grief focus"],
     "IPT’s grief focus is not open-ended mourning; it is a time-limited reconstruction of the lost relationship and the social role that died with it. Klerman insisted depression after death is still depression."),
    ("cbt-thought-record", ["thought record", "three column", "hot thought"],
     "The thought record is Beck’s laboratory notebook for civilians. Situation, feeling, automatic thought, evidence — a paper tool that makes a mind inspectable."),
    ("socratic-beck", ["socratic questioning", "guided discovery"],
     "Beck borrowed Socratic questioning so the patient, not the therapist, would say the new idea first. Guided discovery is the opposite of a TED talk in a white coat."),
    ("behavioral-experiment", ["behavioral experiment", "bennett-levy"],
     "Behavioral experiments (Bennett-Levy and the Oxford group) test a thought in the world instead of at the whiteboard. “If I speak up, I will be humiliated” becomes a designed experience, not a debate."),
    ("exposure-hierarchy", ["fear hierarchy", "graded exposure"],
     "The graded hierarchy is Wolpe’s skeleton still standing inside modern exposure. You can argue inhibitory learning all afternoon; you still need a list that starts somewhere survivable."),
    ("interoceptive-barlow", ["interoceptive exposure", "barlow", "panic control"],
     "David Barlow’s panic-control treatment puts patients on a spinning chair or a straw to evoke the feared body sensation. Interoceptive exposure is the moment CBT gets strangely physical."),
    ("unified-protocol", ["unified protocol", "barlow transdiagnostic"],
     "Barlow’s Unified Protocol treats neuroticism’s shared processes — emotion avoidance, catastrophic appraisal — across anxiety and depression. A transdiagnostic bet that brands had over-split the pie."),
    ("third-wave-hayes", ["third wave", "mindfulness cbt", "acceptance based"],
     "“Third-wave” CBT (Hayes and others) added acceptance, mindfulness, and values to a second wave that had focused on changing thought content. ACT, DBT, MBCT are cousins in that generation."),
    ("kabat-zinn-mbct", ["mbct", "kabat-zinn", "teasdale", "segal", "williams"],
     "Kabat-Zinn’s MBSR (1979) plus Teasdale, Segal, and Williams’s MBCT turned meditation into a relapse-prevention package for recurrent depression. Decentering from thoughts is the shared active ingredient."),
    ("linehan-zen", ["zen dbt", "radical acceptance", "willfulness"],
     "Linehan studied Zen while building DBT. Radical acceptance is a monastic idea doing emergency work on a self-harm unit. Willfulness versus willingness is the same dialectic in everyday clothes."),
    ("animal-levinson", ["levinson pet therapy", "companion animal", "esa vs service"],
     "Boris Levinson described “pet therapy” in the 1960s after his dog Jingles wandered into a session. The modern ESA-versus-service-animal distinction is a legal fence around a much older clinical observation: creatures calm people."),
    ("ada-service-animal", ["service animal", "ada", "task trained", "emotional support animal"],
     "Under the ADA, a service animal is task-trained work, not a vibe. Emotional support animals have a different, narrower paper trail. The distinction exists because warmth is not a public-access right."),
    ("harlow-contact", ["harlow", "contact comfort", "cloth mother"],
     "Harry Harlow’s cloth-versus-wire mothers (1950s) made contact comfort unforgettable and ethically infamous. Attachment theory got a brutal primate film clip; research ethics got a cautionary tale."),
    ("spitz-anaclitic", ["spitz", "anaclitic depression", "hospitalism"],
     "René Spitz filmed hospitalism and anaclitic depression in foundling homes (1940s). Infants who were fed but not held failed to thrive. Every later argument about visitation and orphanage care sits on those reels."),
    ("robertson-separation", ["robertson film", "a two-year-old goes to hospital"],
     "James and Joyce Robertson’s films of children in hospital (1950s–60s) changed visiting policies. Bowlby had the theory; the Robertsons had the footage that made administrators flinch."),
    ("ainsworth-uganda", ["uganda ainsworth", "baltimore attachment"],
     "Ainsworth’s work began with field observation in Uganda, then Baltimore. Attachment patterns are not a WEIRD-lab invention — though how we code them still is a Western research dialect."),
    ("main-adult-aai", ["adult attachment interview", "aai", "coherence narrative"],
     "The Adult Attachment Interview asks about childhood and scores the how of the telling — coherence, not the horror of the content. A fluent tragedy can be secure-autonomous; a sunny, empty narrative may not."),
    ("slade-parent-aai", ["parental aai", "reflective parenting"],
     "Arietta Slade and others brought the AAI into the nursery: a parent’s narrative coherence predicts how they will treat the baby’s mind. Therapy with the adult is sometimes infant prevention."),
    ("beebe-microanalysis", ["beebe", "split screen", "infant regulation"],
     "Beatrice Beebe’s split-screen microanalysis of mother–infant second-by-second regulation made “attunement” visible as timing, not warmth. A lot of adult psychotherapy is trying to restart that dance."),
    ("trongone-wait", ["still face", "tronick"],
     "Ed Tronick’s Still Face (1978) — mother goes blank for two minutes — produces protest, despair, and a lasting teaching clip. It is the attachment system caught in the act."),
    ("fraiberg-ghosts-clinic", ["ghosts nursery clinic", "unremembered trauma parent"],
     "Fraiberg’s ghosts are not metaphors when a parent startles at a baby’s cry that sounds like someone else. Naming the ghost in the room is sometimes the whole intervention."),
    ("stern-moments", ["daniel stern", "moments of meeting", "now moment"],
     "Daniel Stern’s “moments of meeting” (The Present Moment, 2004) described change as a shared now, not only an interpretation. Relational and infant research shaking hands."),
    ("boston-change", ["boston change process", "implicit relational", "lyons-ruth"],
     "The Boston Change Process Study Group argued that implicit relational knowing shifts in small authentic moments. Not every change is declarative insight. Some of it is a new way of being with someone."),
    ("lyons-ruth-disorganized", ["lyons-ruth", "hostile-helpless", "disorganized caregiving"],
     "Karlen Lyons-Ruth’s hostile-helpless caregiving construct links a parent’s unintegrated trauma to infant disorganization. It is one of the cleaner bridges from adult personality to the next generation."),
    ("target-mentalize-play", ["pretend play mentalizing", "target fonagy children"],
     "Fonagy and Target described how pretend play is mentalizing practice: this banana is a phone, and we both know it is not. Therapy with children (and MBT) still uses play as a gym for minds."),
    ("anna-freud-hampstead", ["hampstead", "developmental lines", "anna freud clinic"],
     "Anna Freud’s Hampstead clinic wrote developmental lines — from dependency to self-reliance — so child analysis had a map besides drive theory. A lot of “ego strength” talk is her clinic’s dialect."),
    ("mahler-separation", ["mahler", "separation-individuation", "rapprochement"],
     "Margaret Mahler’s separation-individuation (especially rapprochement) described the toddler who bolts then races back. Borderline theory borrowed that dance; whether the timetable holds is less important than the image."),
    ("masterson-rewarding-withdrawing", ["masterson", "rewarding object", "withdrawing object"],
     "James Masterson described the borderline dilemma as a rewarding unit versus a withdrawing unit: get close and disappear, stay distant and feel empty. A clinical cartoon that patients often recognize immediately."),
    ("adler-gabbard-groups", ["group process", "here and now group", "yalom here"],
     "Yalom’s here-and-now group is an interpersonal laboratory: talk about what is happening between us, not only about your mother. Universality and interpersonal learning need the room to be the subject."),
    ("bion-basic-assumptions", ["basic assumptions", "dependency fight-flight", "pairing bion"],
     "Bion’s basic-assumption groups — dependency, fight–flight, pairing — describe what a committee does instead of its task. Once you see them, staff meetings are never the same."),
    ("foulkes-matrix", ["foulkes", "group matrix", "group analysis"],
     "S. H. Foulkes treated the group as a matrix in which every remark is a communication about the whole. Group analysis is less “eight individual therapies” than one conversation with many mouths."),
    ("agazarian-systems", ["agazarian", "systems-centered", "functional subgrouping"],
     "Yvonne Agazarian’s systems-centered therapy made subgrouping a technique: sit with the people who feel what you feel, then talk across the difference. A systems engineer’s gift to process groups."),
    ("cbt-panic-clark", ["clark panic", "catastrophic misinterpretation"],
     "David M. Clark’s cognitive model of panic (1986) is a loop: body sensation → catastrophe (“I’m dying”) → more sensation. Interoceptive exposure plus reinterpretation cuts the loop. Elegant and teachable."),
    ("ocd-salkovskis", ["salkovskis", "inflated responsibility", "erp"],
     "Salkovskis’s cognitive model of OCD centers inflated responsibility and thought-action fusion. ERP remains the behavioral engine; the cognition explains why a doubt feels like a crime."),
    ("erp-meyer", ["exposure response prevention", "meyer 1966", "ritual prevention"],
     "Victor Meyer’s 1966 case series of ritual prevention is the seed of ERP. The instruction is still rude and kind: touch the contaminant, do not wash, wait. Habituation and inhibitory learning do the rest."),
    ("ptsd-horowitz", ["horowitz stress response", "intrusion avoidance oscillation"],
     "Mardi Horowitz described trauma as an oscillation between intrusion and denial/avoidance. Every later dual-process PTSD model is a grandchild of that pendulum."),
    ("van-der-kolk-body", ["van der kolk", "body keeps score", "somatic trauma"],
     "Bessel van der Kolk’s The Body Keeps the Score made somatic trauma mainstream. The book outran some of its evidence; the clinical reminder — bodies remember what narratives skip — stuck for a reason."),
    ("herman-recovery", ["herman trauma", "recovery stages", "safety remembrance reconnection"],
     "Judith Herman’s Trauma and Recovery (1992) gave three stages: safety, remembrance and mourning, reconnection. It is still the ethical sequence when someone wants to start with exposure on day one."),
    ("judith-complex-ptsd", ["complex ptsd", "herman complex", "disorders of extreme"],
     "Herman’s complex PTSD (and van der Kolk’s DESNOS) named what repeated captivity does that a single accident does not. ICD-11 eventually made a home for it; DSM still argues."),
    ("fidler-activity", ["activity group", "fidler", "occupational therapy group"],
     "Gail Fidler’s activity groups used doing, not only talking, as the medium. Occupational therapy’s reminder to psychiatry: some people mentalize better when their hands are busy."),
    ("yalom-inpatient", ["inpatient group yalom", "higher lower functioning"],
     "Yalom’s inpatient group work accepted that you may only have one session with a person. Support, universality, and a taste of interpersonal feedback — not a slow-cooked outpatient process."),
]

# Extra fallbacks keyed by coarse bucket so leftovers still get a real story.
FALLBACKS: list[tuple[str, list[str], str]] = [
    ("fb-cn", ["cranial nerve"],
     "The twelve cranial nerves were numbered by Samuel Thomas von Sömmerring in 1778. The numbering is arbitrary historical traffic law — which is why “the fifth” means trigeminal to every neurologist on earth."),
    ("fb-peri", ["peripheral nerve"],
     "Silas Weir Mitchell’s Civil War clinic described causalgia and phantom limbs in shattered peripheral nerves. American neurology’s first great casebook was a battlefield."),
    ("fb-muscle", ["muscle disorder", "myopath", "dystroph"],
     "Duchenne’s camera and calipers made muscle disease visible in the 1860s. A century later dystrophin, ion channels, and mitochondrial genomes split “myopathy” into a shelf of named molecules."),
    ("fb-dem", ["dementia"],
     "Kraepelin separated senile dementia from paralysis agitans and general paresis more than a century ago. We still spend careers deciding which named protein — amyloid, synuclein, tau, TDP-43 — owns the next patient."),
    ("fb-aphasia", ["aphasia", "anosognosia"],
     "Babinski coined anosognosia in 1914 for hemiplegic patients who insisted the dead limb was fine. Language and insight can fail independently — a fact Broca and Babinski would have recognized in each other’s wards."),
    ("fb-ha", ["headache"],
     "Aretaeus of Cappadocia already split migraine from other headaches in the second century. The International Headache Society’s manuals are a long footnote to that split, with better triptans."),
    ("fb-epil", ["epilepsy", "seizure"],
     "John Hughlings Jackson called epilepsy “an occasional, sudden, excessive, rapid, and local discharge of grey matter” in the 1870s. Every later EEG and ion-channel paper is an instrumentation of that sentence."),
    ("fb-stroke", ["stroke", "tia", "ischemic"],
     "“Stroke” is Old English for a blow from the gods. Virchow’s thrombosis, C. Miller Fisher’s lacunes, and 2015’s thrombectomy trials are the slow secularization of that blow into plumbing we can sometimes fix."),
    ("fb-vis", ["visual disturbance", "diplopia", "field cut"],
     "Newton’s prism and Young–Helmholtz color vision sit behind every “where is the lesion?” visual question. The pathway from retina to calcarine cortex is a 19th-century dissection that MRI merely colorized."),
    ("fb-cong", ["congenital cerebral", "cerebral palsy", "developmental delay"],
     "William Little described spastic diplegia in the 1860s and blamed birth injury; Freud later argued many cases were prenatal. The argument never quite ended — it just gained MRI and NICUs."),
    ("fb-pain", ["chronic pain", "spinothalamic"],
     "Melzack and Wall’s gate-control theory (1965) was wrong in the details and revolutionary in the frame: pain is gated, not a dedicated cable. Every later neuromodulator and CBT-for-pain protocol lives in that idea."),
    ("fb-ms", ["multiple sclerosis"],
     "Charcot, then Rivers and Schaltenbrand, then the interferon era, then B-cell depletion: MS is a museum of how neurology treats what it cannot yet prevent. Oligoclonal bands remain the oldest lab handshake."),
    ("fb-sex", ["sexual function", "erectile", "priapism"],
     "Sildenafil began as an anti-anginal that failed — and then Pfizer’s trial subjects refused to give the leftover pills back. A side effect that rewrote sexual-medicine clinics and a few psychiatric medication talks."),
    ("fb-sleep", ["sleep disorder", "insomnia", "narcolepsy"],
     "Nathaniel Kleitman spent a month in Mammoth Cave in 1938 to prove the body has a clock. Sleep medicine is that stubborn experiment plus Berger’s EEG, turned into a billing specialty."),
    ("fb-move", ["involuntary movement", "chorea", "dystonia", "parkinson"],
     "Charcot’s Tuesday lessons made movement disorders a spectator sport. Film, then levodopa, then deep-brain stimulation turned the Salpêtrière circus into treatable physiology."),
    ("fb-tumor", ["brain tumor", "paraneoplastic", "metastatic"],
     "Paraneoplastic neurology began with odd neuropathies beside lung masses; onconeural antibodies later made the “remote effect of cancer” a lab diagnosis. The tumor is sometimes found because the cerebellum failed first."),
    ("fb-lp", ["lumbar puncture", "imaging studies", "csf"],
     "Quincke’s needle (1891) and Hounsfield’s CT (1971) bookend a century in which we stopped guessing what was inside the skull. Xanthochromia and Hounsfield units are two ways of seeing blood."),
    ("fb-nt", ["neurotransmitter", "drug abuse", "dopamine", "serotonin"],
     "Loewi’s dream (acetylcholine), Rapport’s serum vasoconstrictor (serotonin), and Carlsson’s dopamine (Nobel 2000) are why psychiatry is a chemical story at all. Every later receptor subtype is a footnote to those three."),
    ("fb-tbi", ["traumatic brain", "concussion", "postconcussive"],
     "Harrison Martland described “punch drunk” fighters in 1928; Omalu’s CTE work made the same idea a public argument. Psychiatry meets neurology in the personality that does not come back after the helmet comes off."),
    ("fb-review", ["additional review", "review questions"],
     "Kaufman’s review questions are the book talking to itself: the same localizing facts, reshuffled. Neurologists have run “where is the lesion?” drills since Gowers. The format is old; the arteries have the same names."),
    ("fb-psychodyn", ["psychodynamic"],
     "Psychodynamic therapy is the long argument that started in Freud’s Wednesday Society and ran through Klein, Winnicott, Kohut, and Kernberg. The shared claim: the past is not past when it is sitting in the chair across from you."),
    ("fb-cbt", ["cbt", "cognitive behavioral"],
     "CBT is Beck’s disappointment with psychoanalysis plus Wolpe’s graded fear plus Skinner’s contingencies. A mid-century hybrid that became the default language of “evidence-based” for better and for worse."),
    ("fb-dbt", ["dbt", "dialectical behavior"],
     "DBT is the only major manual that began as a treatment for people other therapies expelled. Linehan’s dialectic — you are doing the best you can and you have to change — is still the sentence that makes the room possible."),
    ("fb-mi", ["motivational interviewing", "mi core", "mi applied"],
     "Motivational interviewing began as a way not to argue with drinkers. Miller and Rollnick turned ambivalence from a character flaw into the thing you interview."),
    ("fb-act", ["act technique", "acceptance and commitment"],
     "ACT came out of behavior analysis and a panic history. Psychological flexibility — feeling what is here and still moving toward a value — is the whole model, drawn as a hexagon so it will stick on a whiteboard."),
    ("fb-ipt", ["ipt"],
     "IPT was written so depression drugs would have a fair psychotherapy comparator. It kept the medical model and the social focus, and accidentally became a first-line treatment."),
    ("fb-mbt", ["mbt", "mentalization"],
     "Mentalization-based treatment is attachment research that learned to sit in a room with borderline arousal. When minds go offline, the therapist’s job is to get thinking back online before content."),
    ("fb-tfp", ["tfp", "supportive"],
     "Transference-focused psychotherapy is Kernberg’s object-relations map turned into a twice-weekly contract. Supportive therapy is the older craft of strengthening what already works. Both care about the frame."),
    ("fb-trauma", ["trauma"],
     "PTSD entered DSM-III in 1980 after Vietnam, rape-crisis, and Holocaust clinicians forced the issue. PE, CPT, and EMDR are later instruments; Herman’s sequence — safety, then story — is the ethics."),
    ("fb-group", ["group", "family", "couples"],
     "Group therapy has military and TB-sanatorium roots; family therapy has Palo Alto and Minuchin’s lunch sessions. Yalom’s factors and Bowen’s triangles are two different ways of saying: the unit of treatment is larger than one skull."),
    ("fb-integ", ["integration", "modality selection"],
     "Psychotherapy integration is what working clinicians actually do: borrow a chain analysis on Monday and a transference comment on Thursday. Norcross and colleagues spent careers studying that eclecticism instead of scolding it."),
    ("fb-psycho-soc", ["psychosocial", "companion animals"],
     "Companion-animal work goes back to Levinson’s dog wandering into a session in the 1960s. The ADA later had to separate task-trained service animals from comfort — a legal plot twist on a clinical observation."),
]


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def wordish(hay: str, key: str) -> bool:
    k = norm(key)
    if not k:
        return False
    if " " in k:
        return k in hay
    return re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", hay) is not None


def haystack(q: dict) -> str:
    quiz = q.get("quizapine") or {}
    kauf = q.get("kaufman") or {}
    tags = q.get("tags") or {}
    bits = [
        q.get("year") or "",
        q.get("prite_label") or "",
        q.get("answer_text") or "",
        (q.get("stem") or "")[:700],
        (q.get("explanation_text") or "")[:900],
        quiz.get("topic") or "",
        quiz.get("modality") or "",
        kauf.get("chapter") or "",
        kauf.get("teach_title") or "",
        " ".join(tags.get("neuro") or []),
        " ".join(tags.get("topics") or []),
        " ".join(tags.get("psychotherapy") or []),
    ]
    return norm(" ".join(str(b) for b in bits if b))


def score(keys: list[str], hay: str, answer: str, label: str = "") -> int:
    n = 0
    ans = norm(answer)
    lab = norm(label)
    for k in keys:
        if not wordish(hay, k):
            continue
        if " " in k:
            n += 6
        elif len(k) >= 8 or "-" in k:
            n += 3
        else:
            n += 1
        if wordish(ans, k):
            n += 5
        if lab and wordish(lab, k):
            n += 4
    return n


def qid_of(q: dict) -> str:
    return f"{q.get('year')}-{q.get('q_index')}"


def pick(q: dict, used: set[str]) -> tuple[str, str, int]:
    hay = haystack(q)
    ans = q.get("answer_text") or ""
    quiz = q.get("quizapine") or {}
    kauf = q.get("kaufman") or {}
    label = " ".join([
        str(q.get("year") or ""),
        str(q.get("prite_label") or ""),
        str(quiz.get("modality") or ""),
        str(quiz.get("topic") or ""),
        str(kauf.get("chapter") or ""),
    ])
    ranked: list[tuple[int, int, str, str]] = []
    for i, (fid, keys, text) in enumerate(FACTS):
        pts = score(keys, hay, ans, label)
        if pts <= 0:
            continue
        ranked.append((pts, 0 if fid not in used else 1, fid, text))
    ranked.sort(key=lambda t: (-t[0], t[1], t[2]))
    is_review = str(q.get("year") or "").lower() == "review"
    min_pts = 1 if is_review else 3
    if ranked and ranked[0][0] >= min_pts:
        _, _, fid, text = ranked[0]
        return fid, text, ranked[0][0]
    # Review-bank tags say "Additional Review Questions…" on every item and
    # would otherwise steal the generic review fallback. Score fallbacks
    # against chapter / modality / stem, not that dump tag.
    fb_hay = hay
    fb_label = label
    if "additional review questions" in hay or is_review:
        fb_hay = norm(" ".join([
            (q.get("kaufman") or {}).get("chapter") or "",
            q.get("answer_text") or "",
            (q.get("stem") or "")[:700],
        ]))
        fb_label = ""
    fb_ranked: list[tuple[int, str, str]] = []
    for fid, keys, text in FALLBACKS:
        if is_review and fid == "fb-review":
            continue
        pts = score(keys, fb_hay, ans, fb_label)
        if pts >= 3:
            fb_ranked.append((pts, fid, text))
    fb_ranked.sort(key=lambda t: (-t[0], t[1]))
    if fb_ranked:
        return fb_ranked[0][1], fb_ranked[0][2], fb_ranked[0][0]
    if is_review:
        for fid, _keys, text in FALLBACKS:
            if fid == "fb-review":
                return fid, text, 0
    return "", "", -1


def main() -> int:
    questions: list[dict] = []
    if THERAPY.exists():
        questions.extend(json.loads(THERAPY.read_text()))
    if KAUFMAN.exists():
        questions.extend(json.loads(KAUFMAN.read_text()))

    out: dict[str, str] = {}
    used: set[str] = set()
    assigned = 0
    unique = 0
    missing = 0
    # First pass: unique when possible
    leftovers: list[dict] = []
    for q in questions:
        fid, text, pts = pick(q, used)
        if not text:
            leftovers.append(q)
            continue
        if fid not in used:
            unique += 1
        used.add(fid)
        out[qid_of(q)] = text
        assigned += 1
    for q in leftovers:
        fid, text, pts = pick(q, set())  # allow reuse
        if not text:
            missing += 1
            continue
        out[qid_of(q)] = text
        assigned += 1

    OUT.write_text(json.dumps(out, ensure_ascii=False))
    with gzip.open(str(OUT) + ".gz", "wt", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"wrote {len(out)} contexts ({unique} first-choice unique, {missing} unmatched) -> {OUT}")

    if THERAPY.exists():
        therapy = json.loads(THERAPY.read_text())
        n = 0
        for q in therapy:
            ctx = out.get(qid_of(q))
            if ctx:
                q["context"] = ctx
                n += 1
            elif q.get("context", "").startswith("This item drills") or q.get("context", "").startswith("From Kaufman"):
                q.pop("context", None)
        THERAPY.write_text(json.dumps(therapy, ensure_ascii=False))
        print(f"updated {n} therapy question contexts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
