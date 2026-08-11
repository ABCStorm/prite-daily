/* Further-reading research articles + APA Publishing chapters matched to
   PRITE questions.

   Papers: offline pipeline (Europe PMC / PubMed / re-query) — every PMID from
   APIs only. APA chapters: curated PsychiatryOnline links via Wright EZproxy.
   Served as /data/research_refs.json. */

export type ResearchArticle = {
  /** Present for MEDLINE papers; null/absent for APA chapter cards. */
  pmid?: string | null;
  pmcid?: string | null;
  doi?: string | null;
  title: string;
  journal: string;
  year?: number | null;
  is_open_access?: boolean;
  is_reviewish?: boolean;
  why?: string;
  /** Human-audited one-liner: why this paper helps with THIS question. */
  relevance_sentence?: string;
  url: string;
  urls?: {
    pubmed?: string;
    pmc?: string;
    doi?: string;
    psychiatryonline?: string;
  };
  /** article (default) | apa_chapter */
  kind?: "article" | "apa_chapter";
  source?: string;
  chapter_id?: string;
  book_id?: string;
};

export type ResearchRef = {
  articles: ResearchArticle[];
};

let refsPromise: Promise<Record<string, ResearchRef>> | null = null;

/** Load (and memoise) the research-article index. Failures are not cached. */
export function loadResearchRefs(): Promise<Record<string, ResearchRef>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      let r: Response;
      try {
        r = await fetch("/data/research_refs.json", { cache: "force-cache" });
      } catch (e) {
        throw new Error(`can't reach /data/research_refs.json: ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for research_refs.json`);
      try {
        return (await r.json()) as Record<string, ResearchRef>;
      } catch (e) {
        throw new Error(`research_refs.json wasn't valid JSON: ${String(e)}`);
      }
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}

export function researchForQuestion(
  map: Record<string, ResearchRef>,
  year: string | number,
  qIndex: number,
): ResearchRef | undefined {
  return map[`${year}-${qIndex}`];
}
