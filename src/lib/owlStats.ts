/* Verified "wise owl" statistic for the current PRITE question.

   Built by scripts/owl-stats/build-owl-stats.py from a hand-checked
   canonical library. Every sentence keeps a public source URL. */

export type OwlStat = {
  stat_id: string;
  sentence: string;
  source_label: string;
  source_url: string;
  source_year?: number | null;
  audio_path: string;
};

let refsPromise: Promise<Record<string, OwlStat>> | null = null;
const OWL_STATS_VERSION = "2026-08-16-expanded-v3";

export function loadOwlStats(): Promise<Record<string, OwlStat>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      let r: Response;
      try {
        r = await fetch(`/data/owl_stats.json?v=${OWL_STATS_VERSION}`, { cache: "no-cache" });
      } catch (e) {
        throw new Error(`can't reach /data/owl_stats.json: ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for owl_stats.json`);
      try {
        return (await r.json()) as Record<string, OwlStat>;
      } catch (e) {
        throw new Error(`owl_stats.json wasn't valid JSON: ${String(e)}`);
      }
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}

export function owlForQuestion(
  map: Record<string, OwlStat>,
  year: string | number,
  qIndex: number,
): OwlStat | undefined {
  return map[`${year}-${qIndex}`];
}
