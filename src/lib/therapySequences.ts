/* Quizapine therapy decks often run a vignette across two (sometimes three)
   items. Follow-up stems point at "the previous case" / "the same patient".
   Keep those neighbors adjacent in practice sets. Bienenfeld items are skipped. */

export type TherapySeq = { group: string; index: number; length: number };

const FOLLOW_RE = /(?:previous question|previous vignette(?!-type)|previous scenario|previous case|previous encounter|previous session|prior case|prior vignette|prior scenario|\bthe same patient\b|\bsame patient\b|continuing (?:with )?(?:the )?(?:same |previous )|continuing the (?:previous|same|exchange|case|session)|from the previous|in the previous|(?:man|patient|resident|prescriber|internist) from the previous)/i;

export type SeqQuestion = {
  year: string;
  q_index: number;
  stem?: string;
  quizapine?: unknown;
  bienenfeld?: unknown;
  therapy_seq?: TherapySeq;
};

export function isTherapyFollowUpStem(stem: string): boolean {
  const s = stem || "";
  if (/vignette-type/i.test(s)) return false;
  return FOLLOW_RE.test(s);
}

function qid(q: { year: string; q_index: number }): string {
  return `${q.year}-${q.q_index}`;
}

/** Attach therapy_seq onto Quizapine follow-up chains (same topic / year). */
export function annotateTherapySequences<T extends SeqQuestion>(qs: T[]): T[] {
  const byYear = new Map<string, T[]>();
  for (const q of qs) {
    if (!q.quizapine || q.bienenfeld) continue;
    const list = byYear.get(q.year);
    if (list) list.push(q);
    else byYear.set(q.year, [q]);
  }

  for (const [year, items] of byYear) {
    const sorted = items.slice().sort((a, b) => a.q_index - b.q_index);
    const have = new Set(sorted.map((q) => q.q_index));
    const parent = new Map<number, number>();
    for (const q of sorted) {
      if (isTherapyFollowUpStem(q.stem || "") && have.has(q.q_index - 1)) {
        parent.set(q.q_index, q.q_index - 1);
      }
    }
    if (!parent.size) continue;

    const rootOf = (n: number): number => {
      let cur = n;
      while (parent.has(cur)) cur = parent.get(cur)!;
      return cur;
    };

    const buckets = new Map<number, T[]>();
    const members = new Set<number>([...parent.keys(), ...parent.values()]);
    for (const q of sorted) {
      if (!members.has(q.q_index)) continue;
      const r = rootOf(q.q_index);
      const list = buckets.get(r);
      if (list) list.push(q);
      else buckets.set(r, [q]);
    }

    for (const [root, group] of buckets) {
      group.sort((a, b) => a.q_index - b.q_index);
      if (group.length < 2) continue;
      const key = `${year}:${root}`;
      group.forEach((q, i) => {
        q.therapy_seq = { group: key, index: i, length: group.length };
      });
    }
  }
  return qs;
}

/** If any picked item is part of a chain, pull in the missing neighbors. */
export function expandTherapySequences<T extends SeqQuestion>(picked: T[], bank: T[]): T[] {
  const groups = new Set(
    picked.map((q) => q.therapy_seq?.group).filter((g): g is string => !!g),
  );
  if (!groups.size) return keepTherapySequencesTogether(picked);
  const have = new Set(picked.map(qid));
  const extra = bank.filter((q) => q.therapy_seq && groups.has(q.therapy_seq.group) && !have.has(qid(q)));
  return keepTherapySequencesTogether(picked.concat(extra));
}

/** First time a chain member appears, emit the whole chain in written order. */
export function keepTherapySequencesTogether<T extends SeqQuestion>(qs: T[]): T[] {
  const byGroup = new Map<string, T[]>();
  for (const q of qs) {
    const g = q.therapy_seq?.group;
    if (!g) continue;
    const list = byGroup.get(g);
    if (list) list.push(q);
    else byGroup.set(g, [q]);
  }
  for (const list of byGroup.values()) list.sort((a, b) => (a.therapy_seq?.index ?? 0) - (b.therapy_seq?.index ?? 0));

  const out: T[] = [];
  const seen = new Set<string>();
  for (const q of qs) {
    const id = qid(q);
    if (seen.has(id)) continue;
    const g = q.therapy_seq?.group;
    if (!g) {
      out.push(q);
      seen.add(id);
      continue;
    }
    for (const m of byGroup.get(g) || [q]) {
      const mid = qid(m);
      if (seen.has(mid)) continue;
      out.push(m);
      seen.add(mid);
    }
  }
  return out;
}

/** Shuffle blocks, never splitting a vignette chain. */
export function shuffleKeepingTherapySequences<T extends SeqQuestion>(qs: T[], shuffleFn: <U>(arr: U[]) => U[]): T[] {
  const grouped = keepTherapySequencesTogether(qs);
  const blocks: T[][] = [];
  const seen = new Set<string>();
  for (const q of grouped) {
    const id = qid(q);
    if (seen.has(id)) continue;
    const g = q.therapy_seq?.group;
    if (!g) {
      blocks.push([q]);
      seen.add(id);
      continue;
    }
    const block = grouped.filter((x) => x.therapy_seq?.group === g);
    blocks.push(block);
    for (const m of block) seen.add(qid(m));
  }
  return shuffleFn(blocks).flat();
}
