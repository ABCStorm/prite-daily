/* CPRITE (child PRITE) practice bank — loaded only when the Child toggle is on
   so the main PRITE download stays untouched. */

export const CPRITE_TOPIC_ORDER = [
  "Development",
  "Psychopathology",
  "Psychotherapy",
  "Psychopharmacology",
  "Neuroscience",
  "Ethics & Forensics",
  "Systems & Prevention",
  "Assessment",
  "Research Methods",
  "Consultation & Schools",
];

export function cpriteTopic(q: { cprite?: { topic?: string }; prite_label?: string }): string {
  return q.cprite?.topic || q.prite_label || "Child psychiatry";
}

export function cpriteTopicRank(name: string): number {
  const i = CPRITE_TOPIC_ORDER.findIndex((t) => t.toLowerCase() === String(name || "").toLowerCase());
  return i === -1 ? 80 : i;
}

let promise: Promise<unknown[]> | null = null;

export function loadCpriteQuestions(): Promise<unknown[]> {
  if (!promise) {
    promise = (async () => {
      const r = await fetch("/data/cprite_questions.json?v=2024-q200", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for cprite_questions.json`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("cprite_questions.json was not an array");
      return data as unknown[];
    })().catch((e) => {
      promise = null;
      throw e;
    });
  }
  return promise;
}
