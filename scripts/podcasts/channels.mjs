// The curated podcast roster for question→episode matching.
//
// `uploads` is the channel's uploads playlist id (the channel id with the
// leading "UC" swapped for "UU"). Enumerating that playlist costs 1 quota unit
// per 50 videos, versus 100 units for a single search.list call — which is the
// only reason indexing thousands of episodes is affordable at all.
//
// Every entry below was verified live against the YouTube Data API (2026-08-03
// original roster; 2026-08-05 expansion): the channel exists, is the real
// publisher (not a lookalike), and has enough on-topic teaching volume to be
// worth indexing. Add channels only after the same check — a plain-name search
// returns imposters far more often than the real account.
//
// Expansion policy (keep matches STRONG):
//   - Prefer psychiatry-resident / board-adjacent teaching (psychopharm,
//     psychopathology, addiction, CBT), not general USMLE or lifestyle psych.
//   - Rejected lookalikes: wrong "NEI" nonprofit, "Psyched Podcast" interviews,
//     Osmosis/Ninja Nerd/Boards&Beyond (too little psych signal), Shrink Rap
//     Radio / PsychAlive (soft psych), org promo-only feeds.
//   - Carlat stays core: high-yield, exam-adjacent psychopharm + clinical topics.
//
// `tier` biases tie-breaks when several episodes match equally well:
//   "core"    — psychiatry-resident-facing, exam-adjacent teaching
//   "adjacent" — neurology / internal medicine / society content, matched only
//                when the entity gate is satisfied
export const CHANNELS = [
  // ── Original core psych (verified 2026-08-03) ───────────────────────────
  { name: "NEI Psychopharm",              uploads: "UURE_gZGlwIEg1Z-gVu-nEYw", tier: "core" },
  { name: "Psychopharmacology Institute", uploads: "UUiLds24PUY3XBikuAegoN4A", tier: "core" },
  { name: "Psychiatry & Psychotherapy",   uploads: "UUDV4XSQbdB3n6X3QirO5i_w", tier: "core" },
  { name: "The Carlat Psychiatry Report", uploads: "UUTKxzdLUbMub_peMsDEGvTA", tier: "core" },
  { name: "Psychiatry Boot Camp",         uploads: "UU1eyWq5Yab1dvGVivaR79MQ", tier: "core" },
  { name: "The Academy by Psych Scene",   uploads: "UU4prFExACdE3FN_eOkTGb9w", tier: "core" },
  { name: "American Psychiatric Association", uploads: "UUm8c3GJ8-zYVKk9aKQrDw8g", tier: "core" },
  { name: "Psychiatric Times",            uploads: "UU6SFKBKumRSBPpiaXduxiqQ", tier: "core" },

  // ── Expansion 2026-08-05: psych teaching with strong title/entity signal ─
  // Psychofarm — psychopharm tier-lists, mood stabilizers, ECT, technique
  { name: "Psychofarm",                   uploads: "UUP8Vb6YSM0qE9q5nX1stDjA", tier: "core" },
  // Simple and Practical Mental Health — Mago-style clinical pearls (ASD, bipolar, BED)
  { name: "Simple and Practical Mental Health", uploads: "UUKvv0qgWi3UQb7HtSx4W6kw", tier: "core" },
  // Prof. Suresh Bada Math — dense board-style disorder lectures (NIMHANS)
  { name: "Prof. Suresh Bada Math",       uploads: "UUt3R1upNvfkHkEN3PzwubHA", tier: "core" },
  // Psychiatrist.com / JCP — PPD, TMS, VNS, clinical psychopharm
  { name: "Psychiatrist.com",             uploads: "UUdVfr404BA94WiiLkNB_CGg", tier: "core" },
  // Memorable Psychiatry and Neurology — EPS, psychopharm mega-reviews
  { name: "Memorable Psychiatry and Neurology", uploads: "UUmPnj4g6i8cY6FVNDRB9q0Q", tier: "core" },
  // Psychiatry Lectures — short board topics (EPSE, personality, MMSE)
  { name: "Psychiatry Lectures",          uploads: "UUVZhg8unEqo0XUm8cHAIwbA", tier: "core" },
  // Psych Congress Network — insomnia, bipolar misdx, hoarding, clinical consults
  { name: "Psych Congress Network",       uploads: "UUGp7pvFkZJulhj41x8bGXvQ", tier: "core" },
  // UCSF Addiction Psychiatry Bootcamp — AUD, OUD, benzos, gambling, tobacco
  { name: "UCSF Addiction Psychiatry Bootcamp", uploads: "UUXTWuTgiIWxSA1F8V2gmXiw", tier: "core" },
  // PSYCHOMA TALKS — personality structure, ECT research, dense clinical webinars
  { name: "PSYCHOMA TALKS",               uploads: "UU6xZDhqnF4KAkKHDvS6bGoA", tier: "core" },
  // Dr Beth Colby — psychopharm + clinical micro-teaching (aripiprazole, ADHD, autism)
  { name: "Dr Beth Colby",                uploads: "UUcO7rrcgEG-emkqq_PDs6rQ", tier: "core" },
  // Beck Institute — CBT fundamentals (psychotherapy PRITE items)
  { name: "Beck Institute",               uploads: "UUZ8MAM1oUKyuTQArFrVTFZA", tier: "core" },

  // ── Adjacent: society grand rounds / research (entity-gated only) ───────
  { name: "The Royal College of Psychiatrists", uploads: "UU8tk9gNTTxswGx1bj8XVrRQ", tier: "adjacent" },
  { name: "Brain & Behavior Research Foundation", uploads: "UU4fhqXpIi7pcpyRd13Z1WQA", tier: "adjacent" },
  { name: "American Academy of Neurology", uploads: "UU-4D2FWJmdr5gjpDjiskf8g", tier: "adjacent" },
  { name: "Continuum",                    uploads: "UUDqC-9MOR6zj4xC7Nz2mVww", tier: "adjacent" },
  { name: "The Curbsiders Internal Medicine", uploads: "UUHGfC9YOG2NUMHlf7uhEd8g", tier: "adjacent" },
  { name: "MedCram",                      uploads: "UUG-iSMVtWbbwDDXgXXypARQ", tier: "adjacent" },

  // ── Gap-targeted expansion 2026-08-05 ───────────────────────────────────
  // Chosen from measured coverage, not vibes. After the first full pass the
  // bank sat at 16% overall but: clinical neurology 4% of 600 questions,
  // neuroanatomy/neuroscience 4% of 499, psychotherapy 8% of 536, forensics
  // 5% of 433, C-L 12%, research/biostats 0% of 99. Nothing indexed taught
  // those topics, so no amount of judging could cover them.
  //
  // `kind: "lecture"` is presentational — these teach in lecture form rather
  // than podcast form, and the UI labels them accordingly instead of calling a
  // neuroanatomy lecture a podcast episode.

  // Psychotherapy & psychodynamics (8% → target)
  { name: "PsychotherapyNet",             uploads: "UUGETKkDaF3yxRddqRQhzUrw", tier: "core", kind: "lecture" },
  { name: "Psychotherapy Networker",      uploads: "UUbVuoOwCplB3OZI2IB_TA5A", tier: "core", kind: "lecture" },
  { name: "International Psychoanalytical Association", uploads: "UUWR3R3lkUxb7agVNkAkopmw", tier: "core", kind: "lecture" },
  { name: "American Psychoanalytic Association", uploads: "UUgKlmD-PvTBKGM_jecyfg5w", tier: "core", kind: "lecture" },

  // Child & adolescent (18%), forensics (5%), C-L (12%), sleep (14%)
  { name: "AACAP",                        uploads: "UUT9bDFvoYzcHRKJGMc38g4w", tier: "core", kind: "lecture" },
  { name: "Child Mind Institute",         uploads: "UUJWqhYTN2h00RsOBQSFEytg", tier: "adjacent", kind: "lecture" },
  { name: "Dr. Jeff Kieliszewski (Forensic Psychology)", uploads: "UUbOaoahHR7_sCcLQaUeeSYA", tier: "adjacent", kind: "lecture" },
  { name: "Academy of Consultation-Liaison Psychiatry", uploads: "UU2gvYq1Nxt6LyfDCfnzwboA", tier: "core", kind: "lecture" },
  { name: "American Academy of Sleep Medicine", uploads: "UUVMW2wHI1djijJhahn3UL4w", tier: "core", kind: "lecture" },

  // Academic department grand rounds
  { name: "Yale Psychiatry",              uploads: "UUiMYFv5jbKeNdUIg7iSJGWw", tier: "core", kind: "lecture" },
  { name: "UCSF Psychiatry",              uploads: "UUsBQQfUTu-kYF1FDSRGBNZQ", tier: "core", kind: "lecture" },

  // NOTE — deliberate exception to the "no general USMLE channels" policy above.
  // PRITE tests neuroanatomy and clinical neurology heavily (1,099 questions
  // across those two topics) and no psychiatry podcast teaches them, which is
  // why both sat at 4%. These are held to the stricter `adjacent` floor AND the
  // entity gate AND the judge, so a weak neuro match still gets rejected. Prune
  // any that turn out to earn few accepted matches — acceptance per channel is
  // reported by `verify.mjs --emit`.
  { name: "Ninja Nerd",                   uploads: "UU6QYFutt9cluQ3uSM963_KQ", tier: "adjacent", kind: "lecture" },
  { name: "Osmosis from Elsevier",        uploads: "UUNI0qOojpkhsUtaQ4_2NUhQ", tier: "adjacent", kind: "lecture" },
  { name: "Armando Hasudungan",           uploads: "UUesNt4_Z-Pm41RzpAClfVcg", tier: "adjacent", kind: "lecture" },
  { name: "Neuroscientifically Challenged", uploads: "UUUgZq9PkDp1xaEivtcfJPSg", tier: "adjacent", kind: "lecture" },
  { name: "Institute of Human Anatomy",   uploads: "UUgBg0aacyJnw4qUnb1FlfEQ", tier: "adjacent", kind: "lecture" },
  { name: "Strong Medicine",              uploads: "UUFq5vPnNRNNNysLrktz4aSw", tier: "adjacent", kind: "lecture" },
  { name: "Medicosis Perfectionalis",     uploads: "UUl-J-ovSJhA3or73Q2uVpow", tier: "adjacent", kind: "lecture" },
  { name: "NeurologyLive",                uploads: "UUHZXb4_PakzEjV9AWNZSQEA", tier: "adjacent", kind: "lecture" },
  { name: "Clinical Pharmacology Lectures", uploads: "UUXEj-hdlOIENGk5nMMOhJow", tier: "adjacent", kind: "lecture" },

  // Research design & biostatistics (was 0% of 99 questions)
  { name: "Terry Shaneyfelt",             uploads: "UUgLUKVbTKqX9nQgf0QBhUMA", tier: "adjacent", kind: "lecture" },
  { name: "StatQuest",                    uploads: "UUtYLUTtgS3k1Fg4y5tAhLbw", tier: "adjacent", kind: "lecture" },
];
