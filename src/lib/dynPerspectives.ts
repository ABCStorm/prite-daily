/* Psychodynamic perspective for the current PRITE question. */

export type DynPearl = {
  pearl_id: string;
  sentence: string;
  audio_path: string;
};

let refsPromise: Promise<Record<string, DynPearl>> | null = null;
const DYN_DATA_VERSION = "clinical-3972";

export function loadDynPerspectives(): Promise<Record<string, DynPearl>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      let r: Response;
      try {
        // Version the curated dataset and revalidate it so an already-open
        // browser cannot keep pre-curation insights after a deployment.
        r = await fetch(`/data/dyn_perspectives.json?v=${DYN_DATA_VERSION}`, { cache: "no-cache" });
      } catch (e) {
        throw new Error(`can't reach /data/dyn_perspectives.json: ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for dyn_perspectives.json`);
      try {
        return (await r.json()) as Record<string, DynPearl>;
      } catch (e) {
        throw new Error(`dyn_perspectives.json wasn't valid JSON: ${String(e)}`);
      }
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}
