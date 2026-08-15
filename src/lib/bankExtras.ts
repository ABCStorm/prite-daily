/* Derived study extras for the Neuro (Kaufman) and Therapy (Quizapine) banks.

   These items are not in the PRITE matching pipelines (Kaplan, PubMed sidecar,
   question_context table). We fill the same cards from fields already on the
   question so the learning stack is not empty. */

import type { PodcastRef } from "./podcasts";
import type { ResearchArticle, ResearchRef } from "./researchRefs";

export type BankKind = "prite" | "neuro" | "therapy";

export function bankKindOf(q: { kaufman?: unknown; quizapine?: unknown } | null | undefined): BankKind {
  if (!q) return "prite";
  if (q.kaufman) return "neuro";
  if (q.quizapine) return "therapy";
  return "prite";
}

export function bankKindOfList(all: { kaufman?: unknown; quizapine?: unknown }[] | null | undefined): BankKind {
  if (!all?.length) return "prite";
  return bankKindOf(all[0]);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "topic";
}

function firstSentence(text: string, max = 280): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cut = t.match(/^(.+?[.!?])\s/);
  const s = cut ? cut[1] : t;
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
}

export function teachingPoint(explanation: string): string {
  const m = (explanation || "").match(/Teaching point:\s*(.+)$/i);
  return (m?.[1] || "").replace(/\s+/g, " ").trim();
}

export function neuroChapter(q: {
  kaufman?: { chapter?: string; chapter_num?: string | number };
  prite_label?: string;
  tags?: { neuro?: string[] };
  year?: string;
}): string {
  return (
    q.kaufman?.chapter ||
    q.tags?.neuro?.[0] ||
    (q.prite_label || "").replace(/^Chapter \d+:\s*/, "") ||
    q.year ||
    "Neurology"
  );
}

/** Chapter 4 before Chapter 10 — string sort puts "Ch 10" first. */
export function neuroYearRank(year: string): number {
  if (/review/i.test(year)) return 999;
  const n = parseInt(String(year).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 500;
}

export function neuroTopicLabel(title: string): string {
  const t = (title || "").replace(/^Chapter\s+\d+:\s*/i, "").trim();
  if (/additional review/i.test(t)) return "Review";
  return t;
}

export function neuroChapterOptionLabel(year: string, title: string): string {
  if (/review/i.test(year)) return "Review questions";
  const n = String(year).replace(/\D/g, "");
  const clean = neuroTopicLabel(title);
  if (n && clean && clean !== year && clean !== "Review") return `Ch ${n} — ${clean}`;
  return year;
}

export function therapyModality(q: { quizapine?: { modality?: string }; prite_label?: string }): string {
  return q.quizapine?.modality || q.prite_label || "Psychotherapy";
}

/** Fill empty practice / video / context / tag fields from what the bank already has. */
export function enrichBankQuestion<T extends Record<string, unknown>>(raw: T): T {
  const q = raw as T & {
    stem?: string;
    explanation_text?: string;
    answer_text?: string;
    year?: string;
    prite_label?: string;
    prite_category?: string;
    tags?: Record<string, unknown>;
    clinical_application?: string;
    video_query?: string;
    context?: string;
    kaufman?: { chapter?: string; chapter_num?: string | number; teach_title?: string };
    quizapine?: { modality?: string; topic?: string; sources?: string[] };
  };
  const kind = bankKindOf(q);
  if (kind === "prite") return raw;

  const expl = String(q.explanation_text || "");
  const point = teachingPoint(expl);
  const chapter = neuroChapter(q);
  const modality = therapyModality(q);

  let clinical = q.clinical_application;
  if (!clinical) {
    if (kind === "therapy") {
      const move = point || firstSentence(expl);
      clinical = move
        ? `In clinic this shows up as: ${firstSentence(String(q.stem || ""))} What you actually do: ${move}`
        : firstSentence(String(q.stem || ""), 400);
    } else {
      const take = point || firstSentence(expl);
      clinical = take
        ? `${firstSentence(String(q.stem || ""), 240)} On the ward: ${take}`
        : firstSentence(String(q.stem || ""), 400);
    }
  }

  let video = q.video_query;
  if (!video) {
    if (kind === "therapy") {
      const topic = q.quizapine?.topic || q.year || modality;
      video = `${modality} ${topic} psychotherapy psychiatry`.replace(/\s+/g, " ").slice(0, 120);
    } else {
      video = `${chapter} ${q.answer_text || ""} neurology psychiatry`.replace(/\s+/g, " ").slice(0, 120);
    }
  }

  // Context for Neuro/Therapy is a sidecar of historical / gee-whiz factoids
  // (`bank_context.json`). Do not invent a generic "this item drills…" blurb.

  let tags = q.tags && typeof q.tags === "object" ? { ...q.tags } as Record<string, unknown> : {};
  if (kind === "therapy") {
    tags = {
      diagnosis: [],
      medication: [],
      psychotherapy: [modality],
      neuro: [],
      historical: [],
      setting: null,
      topics: [String(q.year || modality), modality],
      ...tags,
    };
    if (!(tags.topics as string[])?.length) tags.topics = [String(q.year || modality), modality];
  }

  return {
    ...q,
    prite_category: kind === "therapy" ? slug(modality) : (q.prite_category || slug(chapter)),
    prite_label: kind === "therapy" ? modality : (q.prite_label || chapter),
    tags,
    clinical_application: clinical,
    video_query: video,
  };
}

export function podcastKeysFor(q: {
  kaufman?: { chapter?: string };
  quizapine?: { modality?: string };
  tags?: { neuro?: string[] };
  prite_label?: string;
  year?: string;
}): string[] {
  const keys: string[] = [];
  if (q.quizapine?.modality) keys.push(`therapy:${q.quizapine.modality}`);
  const ch = neuroChapter(q);
  if (q.kaufman || q.tags?.neuro?.length) keys.push(`neuro:${ch}`);
  if (q.year) keys.push(`year:${q.year}`);
  return keys;
}

export function furtherReadingFor(q: {
  quizapine?: { sources?: string[]; topic?: string; modality?: string };
  kaufman?: { chapter?: string; teach_title?: string };
  prite_label?: string;
  answer_text?: string;
  year?: string;
}): ResearchRef | undefined {
  const articles: ResearchArticle[] = [];
  for (const src of q.quizapine?.sources || []) {
    const title = src.trim();
    if (!title) continue;
    const query = encodeURIComponent(title.replace(/,?\s*\d{4}.*$/, "").slice(0, 140));
    articles.push({
      title,
      journal: q.quizapine?.modality ? `${q.quizapine.modality} source` : "Primary source",
      why: q.quizapine?.topic
        ? `Primary reference cited for “${q.quizapine.topic}.”`
        : "Source cited on this psychotherapy item.",
      url: `https://scholar.google.com/scholar?q=${query}`,
      kind: "article",
    });
  }
  if (q.kaufman) {
    const chapter = q.kaufman.teach_title || q.kaufman.chapter || q.prite_label || "clinical neurology psychiatry";
    const query = encodeURIComponent(`${chapter} psychiatry review`);
    articles.push({
      title: `PubMed search: ${chapter}`,
      journal: "PubMed",
      why: "Further reading around this Kaufman chapter — reviews and clinical papers a resident can open next.",
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${query}`,
      kind: "article",
    });
  }
  return articles.length ? { articles } : undefined;
}

export function autoFlashcard(q: {
  year: string;
  q_index: number;
  answer_text?: string;
  explanation_text?: string;
  quizapine?: { topic?: string; modality?: string };
  kaufman?: { chapter?: string };
  prite_label?: string;
}): { question_id: string; cloze_text: string; extra: string } {
  const id = `${q.year}-${q.q_index}`;
  const topic = q.quizapine?.topic || q.kaufman?.chapter || q.prite_label || q.year;
  const ans = (q.answer_text || "the correct next step").replace(/\s+/g, " ").trim();
  const point = teachingPoint(q.explanation_text || "");
  const cloze = point
    ? `${topic} — {{c1::${point}}}`
    : `${topic}: the board-level move is {{c1::${ans}}}.`;
  const extra = (q.explanation_text || ans).replace(/\s+/g, " ").trim().slice(0, 900);
  return { question_id: id, cloze_text: cloze, extra };
}

let bankContext: Promise<Record<string, string>> | null = null;

export function loadBankContext(): Promise<Record<string, string>> {
  if (!bankContext) {
    bankContext = fetch("/data/bank_context.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return bankContext;
}

let bankPodcasts: Promise<Record<string, PodcastRef[]>> | null = null;

export function loadBankPodcasts(): Promise<Record<string, PodcastRef[]>> {
  if (!bankPodcasts) {
    bankPodcasts = fetch("/data/bank_podcasts.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return bankPodcasts;
}
