/* Bienenfeld, Psychodynamic Theory for Clinicians — practice bank + reader.

   Questions live at /bienenfeld/questions/all.json (public, written for this
   site). Page photos live at /bienenfeld/pages/*.jpg and are also used by the
   standalone reader at /bienenfeld/. q_index is remapped per chapter so
   questionId(year, q_index) is unique — the source files reuse 1–8 on every page. */

export type BienenfeldLoc = {
  page?: number | null;
  chapter_id?: string;
  chapter_title?: string;
  quote?: string;
  image?: string;
};

export type BienenfeldChapterPage = {
  tag: string;
  printed_page?: string | null;
  printed_int?: number | null;
  image: string;
};

export type BienenfeldChapter = {
  id: string;
  number?: string | number | null;
  title: string;
  kind?: string;
  start?: number | null;
  pages: BienenfeldChapterPage[];
};

let questionsPromise: Promise<unknown[]> | null = null;
let chaptersPromise: Promise<BienenfeldChapter[]> | null = null;

export function bienenfeldYearRank(year: string): number {
  if (/^cases/i.test(year)) return 0;
  const n = year.match(/^(\d+)\b/);
  if (n) return Number(n[1]);
  const letter = year.match(/^([A-D])\b/);
  if (letter) return 10 + (letter[1].charCodeAt(0) - 65);
  if (/index/i.test(year)) return 20;
  return 50;
}

export function bienenfeldChapterLabel(title: string): string {
  return (title || "").replace(/^[0-9A-D]\s+/, "").trim() || title;
}

/** Stable 1..N q_index within each chapter so progress keys do not collide. */
export function normalizeBienenfeldQuestions(raw: unknown[]): unknown[] {
  type Row = {
    year?: string;
    q_index?: number;
    quizapine?: { modality?: string; topic?: string; sources?: string[]; difficulty?: string };
    bienenfeld?: BienenfeldLoc;
    [key: string]: unknown;
  };
  const items = (raw as Row[]).slice().sort((a, b) => {
    const ya = String(a.year || "");
    const yb = String(b.year || "");
    if (ya !== yb) return bienenfeldYearRank(ya) - bienenfeldYearRank(yb) || ya.localeCompare(yb);
    const pa = a.bienenfeld?.page ?? 0;
    const pb = b.bienenfeld?.page ?? 0;
    if (pa !== pb) return Number(pa) - Number(pb);
    return (a.q_index || 0) - (b.q_index || 0);
  });
  const seen = new Map<string, number>();
  return items.map((q) => {
    const year = String(q.year || "Bienenfeld");
    const n = (seen.get(year) || 0) + 1;
    seen.set(year, n);
    const chapter = q.bienenfeld?.chapter_title || year;
    return {
      ...q,
      q_index: n,
      quizapine: {
        ...(q.quizapine || {}),
        modality: "Bienenfeld",
        topic: q.quizapine?.topic || bienenfeldChapterLabel(chapter),
      },
    };
  });
}

export function loadBienenfeldQuestions(): Promise<unknown[]> {
  if (!questionsPromise) {
    questionsPromise = (async () => {
      const r = await fetch("/bienenfeld/questions/all.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for bienenfeld questions`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("bienenfeld questions was not an array");
      return normalizeBienenfeldQuestions(data);
    })().catch((e) => {
      questionsPromise = null;
      throw e;
    });
  }
  return questionsPromise;
}

export function loadBienenfeldChapters(): Promise<BienenfeldChapter[]> {
  if (!chaptersPromise) {
    chaptersPromise = (async () => {
      const r = await fetch("/bienenfeld/chapters.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for bienenfeld chapters`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("bienenfeld chapters was not an array");
      return data as BienenfeldChapter[];
    })().catch((e) => {
      chaptersPromise = null;
      throw e;
    });
  }
  return chaptersPromise;
}

export function bienenfeldPageSrc(image?: string | null): string | null {
  if (!image) return null;
  if (image.startsWith("http") || image.startsWith("/")) return image;
  return `/bienenfeld/${image.replace(/^\.\//, "")}`;
}

export type BienenfeldReturn = {
  bank?: "therapy" | "neuro" | "general";
  qid?: string | null;
  view?: "today" | "browse" | "custom" | null;
};

export const THERAPY_RETURN_KEY = "pd_therapy_return";

export function readTherapyReturn(): BienenfeldReturn | null {
  try {
    const v = JSON.parse(localStorage.getItem(THERAPY_RETURN_KEY) || "null") as BienenfeldReturn | null;
    if (!v || typeof v !== "object") return null;
    return {
      bank: "therapy",
      qid: typeof v.qid === "string" && v.qid ? v.qid : null,
      view: v.view === "today" || v.view === "browse" || v.view === "custom" ? v.view : null,
    };
  } catch {
    return null;
  }
}

export function writeTherapyReturn(ret: BienenfeldReturn | null) {
  try {
    if (!ret?.qid) return;
    localStorage.setItem(THERAPY_RETURN_KEY, JSON.stringify({
      bank: "therapy",
      qid: ret.qid,
      view: ret.view || null,
    }));
  } catch { /* private mode */ }
}

export function bienenfeldReturnFromSearch(search?: string): BienenfeldReturn | null {
  try {
    const p = new URLSearchParams(search ?? window.location.search);
    const bankRaw = p.get("bank");
    const qid = p.get("qid");
    const view = p.get("view");
    if (!bankRaw && !qid) return null;
    const bank = bankRaw === "therapy" || bankRaw === "neuro" || bankRaw === "general" ? bankRaw : "therapy";
    return {
      bank,
      qid: qid || null,
      view: view === "today" || view === "browse" || view === "custom" ? view : null,
    };
  } catch {
    return null;
  }
}

export function clearBienenfeldReturnParams() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("bank") && !u.searchParams.has("qid") && !u.searchParams.has("view")) return;
    u.searchParams.delete("bank");
    u.searchParams.delete("qid");
    u.searchParams.delete("view");
    const next = `${u.pathname}${u.search}${u.hash}`;
    window.history.replaceState({}, "", next);
  } catch { /* no-op */ }
}

export function bienenfeldReaderHref(opts: {
  page?: number | null;
  chapterId?: string | null;
  returnTo?: BienenfeldReturn | null;
} = {}): string {
  const params = new URLSearchParams();
  const ret = opts.returnTo;
  if (ret?.bank) params.set("bank", ret.bank);
  if (ret?.qid) params.set("qid", ret.qid);
  if (ret?.view) params.set("view", ret.view);
  const qs = params.toString();
  const path = qs ? `/bienenfeld/?${qs}` : "/bienenfeld/";
  if (opts.page != null && Number.isFinite(Number(opts.page))) return `${path}#${opts.page}`;
  if (opts.chapterId) return `${path}#ch=${encodeURIComponent(opts.chapterId)}`;
  return path;
}
