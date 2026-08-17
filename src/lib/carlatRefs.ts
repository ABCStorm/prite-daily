/* Carlat Medication Fact Book 2026 — Meds toggle bank + local page reader. */

export type CarlatLoc = {
  medication_id: string;
  medication_title: string;
  category: string;
  printed_pages: number[];
  page_images: string[];
  cited_images?: string[];
};

export const CARLAT_CATEGORY_ORDER = [
  "ADHD Medications",
  "Antidepressants",
  "Antipsychotics",
  "Anxiolytic and Hypnotic Medications",
  "Dementia Medications",
  "Mood Stabilizers and Anticonvulsants",
  "Natural Treatments",
  "Sexual Dysfunction Medications",
  "Side Effect Management Medications",
  "Sleep Disorder Medications",
  "Substance Use Disorder Medications",
];

export function carlatCategory(q: { carlat?: { category?: string }; prite_category?: string }): string {
  return q.carlat?.category || q.prite_category || "Medications";
}

export function carlatCategoryRank(name: string): number {
  const i = CARLAT_CATEGORY_ORDER.findIndex((c) => c.toLowerCase() === String(name || "").toLowerCase());
  return i === -1 ? 80 : i;
}

export function carlatPageSrc(path: string): string {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path.replace(/^\/+/, "")}`;
}

export function carlatReaderHref(medicationId?: string): string {
  return medicationId ? `/carlat/#med=${encodeURIComponent(medicationId)}` : "/carlat/";
}

let promise: Promise<unknown[]> | null = null;

export function loadCarlatQuestions(): Promise<unknown[]> {
  if (!promise) {
    promise = (async () => {
      const r = await fetch("/data/carlat_questions.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for carlat_questions.json`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("carlat_questions.json was not an array");
      return data as unknown[];
    })().catch((e) => {
      promise = null;
      throw e;
    });
  }
  return promise;
}
