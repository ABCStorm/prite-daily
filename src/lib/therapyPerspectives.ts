/* Named psychotherapy-modality perspective for the current PRITE question.
   One best-fit modality per question (CBT tried first, then the other
   modalities below) — see scripts/therapy-perspectives/ for how this is built. */

export type TherapyPerspectiveKind =
  | "cbt"
  | "ipt"
  | "dbt"
  | "act"
  | "existential"
  | "supportive"
  | "cpt"
  | "exposure";

export type TherapyPearl = {
  pearl_id: string;
  modality: TherapyPerspectiveKind;
  sentence: string;
};

let refsPromise: Promise<Record<string, TherapyPearl>> | null = null;
const THERAPY_DATA_VERSION = "therapy-v1-0";

export function loadTherapyPerspectives(): Promise<Record<string, TherapyPearl>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      let r: Response;
      try {
        r = await fetch(`/data/therapy_perspectives.json?v=${THERAPY_DATA_VERSION}`, { cache: "no-cache" });
      } catch (e) {
        throw new Error(`can't reach /data/therapy_perspectives.json: ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for therapy_perspectives.json`);
      try {
        return (await r.json()) as Record<string, TherapyPearl>;
      } catch (e) {
        throw new Error(`therapy_perspectives.json wasn't valid JSON: ${String(e)}`);
      }
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}
