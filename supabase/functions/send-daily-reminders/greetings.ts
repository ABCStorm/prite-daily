// Rotating pools for the email's opening two lines (greeting + rank recap),
// so daily regulars don't see the exact same wording every day. Deliberately
// different lengths than jokes.ts so the three rotations don't sync up.

const GREETINGS: string[] = [
  "Good morning, {first} — time for today's PRITE practice. A few questions a day keeps the in-training exam from sneaking up on you.",
  "Morning, {first}! Your daily PRITE reps are ready whenever you are.",
  "Hey {first} — a few PRITE questions before the day gets away from you?",
  "Rise and shine, {first}. Today's practice set is waiting.",
  "Good morning, {first}. Small daily doses of PRITE beat last-minute cramming every time.",
  "Hi {first} — quick reminder to squeeze in some PRITE practice today.",
  "Morning, {first}! Consistency wins the in-training exam. Let's keep the streak going.",
  "Hey {first}, today's a good day to knock out a few PRITE questions.",
  "Good morning, {first} — your future self on exam day will thank you for today's practice.",
  "Morning, {first}. A few minutes of PRITE now saves a lot of stress later.",
  "Hi {first} — ready for today's practice questions?",
  "Good morning, {first}. Let's chip away at the PRITE question bank together.",
  "Hey {first}! Time to sharpen those psychiatry instincts with a few questions.",
  "Morning, {first} — the exam doesn't study itself. A few questions today?",
  "Good morning, {first}. Little and often beats a lot, rarely — let's do today's set.",
  "Hi {first}, your daily PRITE nudge has arrived. A few questions today?",
  "Morning, {first}! Keep the momentum going with today's practice set.",
  "Hey {first} — a quick PRITE session today keeps the knowledge fresh.",
  "Good morning, {first}. Today's a great day to review a few high-yield questions.",
  "Morning, {first} — your brain is warmed up, might as well put it to work on some PRITE questions.",
  "Hi {first}, don't let today slip by without a few practice questions.",
  "Good morning, {first}. Steady practice now means fewer surprises on exam day.",
  "Hey {first}! A few questions a day is all it takes to stay sharp.",
  "Morning, {first} — time to build today's PRITE streak.",
  "Good morning, {first}. Today's practice set is short, but it adds up fast.",
  "Hi {first}, ready to tackle a few PRITE questions before the day heats up?",
  "Morning, {first}! Consistency beats intensity — let's do today's set.",
  "Hey {first} — the in-training exam rewards steady prep. Today's questions are ready.",
  "Good morning, {first}. A few minutes with PRITE Daily goes a long way.",
  "Hi {first}, today's practice questions are waiting whenever you're ready.",
  "Morning, {first}! Small steps daily beat big pushes rarely.",
  "Hey {first} — let's keep that knowledge base growing with today's questions.",
  "Good morning, {first}. Your daily PRITE habit is worth protecting — a few questions today?",
  "Hi {first}, a quick practice session today keeps exam-day nerves at bay.",
  "Morning, {first}! Today's a good day to review a few more PRITE questions.",
  "Good morning, {first} — every question today is one less surprise on exam day.",
];

const RANK_LINES: string[] = [
  "Over the past 2 weeks you've done <b>{answered}</b> {qWord} — ranked <b>#{rank} of {total}</b> in the residency.",
  "In the last 14 days you've knocked out <b>{answered}</b> {qWord}, putting you at <b>#{rank} of {total}</b> in the residency.",
  "Your 2-week tally: <b>{answered}</b> {qWord} done — <b>#{rank} of {total}</b> among your co-residents.",
  "Over the past 2 weeks: <b>{answered}</b> {qWord} completed, good for <b>#{rank} of {total}</b> in the residency.",
  "You've logged <b>{answered}</b> {qWord} in the last 2 weeks — currently <b>#{rank} of {total}</b> residency-wide.",
  "Last 14 days: <b>{answered}</b> {qWord} down, ranking you <b>#{rank} of {total}</b> in the residency.",
  "You're at <b>#{rank} of {total}</b> in the residency this fortnight, with <b>{answered}</b> {qWord} completed.",
  "Two-week check-in: <b>{answered}</b> {qWord} answered, <b>#{rank} of {total}</b> among your peers.",
  "In the past 2 weeks you've tackled <b>{answered}</b> {qWord} — that's <b>#{rank} of {total}</b> in the residency.",
  "Your recent pace: <b>{answered}</b> {qWord} in 14 days, landing you <b>#{rank} of {total}</b> in the residency.",
  "Fortnight tally: <b>{answered}</b> {qWord} completed — <b>#{rank} of {total}</b> residency-wide.",
  "You've answered <b>{answered}</b> {qWord} over the last 2 weeks, ranking <b>#{rank} of {total}</b>.",
  "Current standing: <b>#{rank} of {total}</b> in the residency, based on <b>{answered}</b> {qWord} in the last 14 days.",
  "Over the last 14 days you've completed <b>{answered}</b> {qWord} — <b>#{rank} of {total}</b> in the residency.",
  "You're <b>#{rank} of {total}</b> in the residency this cycle, with <b>{answered}</b> {qWord} done in the past 2 weeks.",
  "Two weeks, <b>{answered}</b> {qWord} — that puts you at <b>#{rank} of {total}</b> in the residency.",
  "Recent activity: <b>{answered}</b> {qWord} in the last 14 days, ranking <b>#{rank} of {total}</b>.",
  "You've done <b>{answered}</b> {qWord} over the past 2 weeks — <b>#{rank} of {total}</b> in the residency and climbing.",
  "Your last-14-days count: <b>{answered}</b> {qWord}, good for <b>#{rank} of {total}</b> in the residency.",
  "In the past 2 weeks: <b>{answered}</b> {qWord} completed, placing you <b>#{rank} of {total}</b>.",
  "Residency check-in: <b>{answered}</b> {qWord} done in 14 days, <b>#{rank} of {total}</b> overall.",
  "You've racked up <b>{answered}</b> {qWord} in the last 2 weeks — <b>#{rank} of {total}</b> in the residency.",
  "Latest tally: <b>{answered}</b> {qWord} in 14 days, ranking <b>#{rank} of {total}</b> among your co-residents.",
  "Over the past fortnight you've done <b>{answered}</b> {qWord}, putting you <b>#{rank} of {total}</b> in the residency.",
];

export function greetingForToday(first: string): string {
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  return GREETINGS[daysSinceEpoch % GREETINGS.length].replace(/\{first\}/g, first);
}

/** Only meaningful when `total > 1` — callers should fall back to a plain
    line when the residency has just one approved member. */
export function rankLineForToday(answered: number, rank: number, total: number): string {
  const qWord = `question${answered === 1 ? "" : "s"}`;
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  return RANK_LINES[daysSinceEpoch % RANK_LINES.length]
    .replace(/\{answered\}/g, String(answered))
    .replace(/\{qWord\}/g, qWord)
    .replace(/\{rank\}/g, String(rank))
    .replace(/\{total\}/g, String(total))
    .replace(/<b>/g, '<b style="color:#0e7a6b">'); // teal highlight, centralized here rather than in all 24 templates
}
