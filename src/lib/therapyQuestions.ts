/* Quizapine psychotherapy bank — original items from quizapine.com.

   Public JSON (these are not a licensed-textbook extract). Loaded only when
   the Therapy toggle is on so the main PRITE download stays untouched. */

export type TherapyMeta = {
  modality: string;
  topic?: string;
  difficulty?: string;
  sources?: string[];
};

let promise: Promise<unknown[]> | null = null;

export function loadTherapyQuestions(): Promise<unknown[]> {
  if (!promise) {
    promise = (async () => {
      const r = await fetch("/data/therapy_questions.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for therapy_questions.json`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("therapy_questions.json was not an array");
      return data as unknown[];
    })().catch((e) => {
      promise = null;
      throw e;
    });
  }
  return promise;
}
